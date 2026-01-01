import { Router, Request, Response } from 'express';
import { sqliteService } from '../database/index.js';
import whatsappService from '../services/whatsapp.js';
import queueService from '../infra/queue.js';
import metricsService from '../infra/metrics.js';
import reminderService from '../services/reminder.js';
import { getMemoryStats } from '../events/messageHandler.js';
import logger from '../utils/logger.js';
import { pollHandler } from '../handlers/pollHandler.js';
import { billingHandler } from '../handlers/billingHandler.js';
import CONFIG from '../config/index.js';

// =============================================================================
// DASHBOARD API ROUTES
// =============================================================================

export function createDashboardRoutes(): Router {
  const router = Router();

  // ===========================================================================
  // HEALTH & STATUS
  // ===========================================================================

  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const whatsappState = whatsappService.getConnectionState();
      const whatsappUptime = whatsappService.getConnectionUptime();
      const queueStats = await queueService.getStats();
      const reminderStats = sqliteService.getReminderStats();
      const memoryStats = getMemoryStats();

      // Get bot settings for pause status
      const botSettings = sqliteService.getBotSettings();

      res.json({
        whatsapp: {
          state: whatsappState,
          connected: whatsappService.isConnected(),
          stable: whatsappService.isConnectionStable(),
          uptime: whatsappUptime,
          uptimeFormatted: formatUptime(whatsappUptime),
        },
        bot: {
          isPaused: botSettings?.botPaused || false,
          pauseReason: botSettings?.pauseReason || null,
          pausedAt: botSettings?.pausedAt || null,
          pausedBy: botSettings?.pausedBy || null,
        },
        queue: queueStats,
        reminders: reminderStats,
        memory: memoryStats,
        system: {
          uptime: process.uptime(),
          uptimeFormatted: formatUptime(process.uptime() * 1000),
          memory: memoryStats,
          platform: process.platform,
          nodeVersion: process.version,
        },
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao obter status', error);
      res.status(500).json({ error: 'Erro ao obter status' });
    }
  });

  // ===========================================================================
  // BOOKINGS
  // ===========================================================================

  router.get('/bookings', (req: Request, res: Response) => {
    try {
      const { unit, date, unitId } = req.query;

      // Support both old format (unit + date) and new format (date + unitId)
      if (date) {
        const dateStr = date as string;

        if (unitId) {
          // New format: find unit by ID
          const units = sqliteService.getUnits();
          const targetUnit = units.find(u => u.id === parseInt(unitId as string));
          if (!targetUnit) {
            res.status(400).json({ error: 'Unidade não encontrada' });
            return;
          }
          const bookings = sqliteService.getBookingsByDate(targetUnit.slug as 'recreio' | 'bangu', dateStr);
          res.json(bookings.map(b => ({
            ...b,
            unitName: targetUnit.name,
          })));
          return;
        }

        if (unit) {
          // Old format
          const bookings = sqliteService.getBookingsByDate(unit as 'recreio' | 'bangu', dateStr);
          res.json({
            unit,
            date: dateStr,
            total: bookings.length,
            bookings,
          });
          return;
        }

        // If only date is provided, return all bookings for that date
        const recreioBookings = sqliteService.getBookingsByDate('recreio', dateStr);
        const banguBookings = sqliteService.getBookingsByDate('bangu', dateStr);
        const allBookings = [
          ...recreioBookings.map(b => ({ ...b, unitName: 'Recreio' })),
          ...banguBookings.map(b => ({ ...b, unitName: 'Bangu' })),
        ];
        res.json(allBookings);
        return;
      }

      res.status(400).json({ error: 'Parâmetro date é obrigatório' });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar agendamentos', error);
      res.status(500).json({ error: 'Erro ao listar agendamentos' });
    }
  });

  // Criar novo agendamento
  router.post('/bookings', (req: Request, res: Response) => {
    try {
      const { name, phone, date, time, unitId, status, source } = req.body;

      if (!name || !phone || !date || !time || !unitId) {
        res.status(400).json({ error: 'Campos obrigatórios: name, phone, date, time, unitId' });
        return;
      }

      // Find unit by ID
      const units = sqliteService.getUnits();
      const unit = units.find(u => u.id === unitId);
      if (!unit) {
        res.status(400).json({ error: 'Unidade não encontrada' });
        return;
      }

      const booking = sqliteService.addBooking({
        unit: unit.slug as 'recreio' | 'bangu',
        date,
        time,
        name,
        phone,
        status: status || 'confirmed',
        source: source || 'dashboard',
      });

      if (!booking) {
        res.status(500).json({ error: 'Erro ao criar agendamento' });
        return;
      }

      res.status(201).json({
        ...booking,
        unitId: unit.id,
        unitName: unit.name,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao criar agendamento', error);
      res.status(500).json({ error: 'Erro ao criar agendamento' });
    }
  });

  // Atualizar agendamento
  router.put('/bookings/:id', (req: Request, res: Response) => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'ID não fornecido' });
        return;
      }
      const id = parseInt(idParam, 10);
      const updates = req.body;

      const booking = sqliteService.updateBooking(id, updates);
      if (!booking) {
        res.status(404).json({ error: 'Agendamento não encontrado' });
        return;
      }

      res.json(booking);
    } catch (error) {
      logger.error('[Dashboard] Erro ao atualizar agendamento', error);
      res.status(500).json({ error: 'Erro ao atualizar agendamento' });
    }
  });

  router.get('/bookings/today', (_req: Request, res: Response) => {
    try {
      const today = new Date().toISOString().split('T')[0] ?? '';

      const recreioBookings = sqliteService.getBookingsByDate('recreio', today);
      const banguBookings = sqliteService.getBookingsByDate('bangu', today);

      res.json({
        date: today,
        recreio: {
          total: recreioBookings.length,
          bookings: recreioBookings,
        },
        bangu: {
          total: banguBookings.length,
          bookings: banguBookings,
        },
        totalGeral: recreioBookings.length + banguBookings.length,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar agendamentos de hoje', error);
      res.status(500).json({ error: 'Erro ao listar agendamentos de hoje' });
    }
  });

  router.get('/bookings/week', (_req: Request, res: Response) => {
    try {
      const today = new Date();
      const weekDays: Array<{
        date: string;
        dayName: string;
        recreio: number;
        bangu: number;
        total: number;
      }> = [];

      const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateStr = date.toISOString().split('T')[0] ?? '';

        const recreio = sqliteService.getBookingsByDate('recreio', dateStr).length;
        const bangu = sqliteService.getBookingsByDate('bangu', dateStr).length;

        weekDays.push({
          date: dateStr,
          dayName: dayNames[date.getDay()] ?? '',
          recreio,
          bangu,
          total: recreio + bangu,
        });
      }

      res.json({
        startDate: weekDays[0]?.date,
        endDate: weekDays[6]?.date,
        days: weekDays,
        totalSemana: weekDays.reduce((sum, day) => sum + day.total, 0),
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar agendamentos da semana', error);
      res.status(500).json({ error: 'Erro ao listar agendamentos da semana' });
    }
  });

  router.delete('/bookings/:id', (req: Request, res: Response) => {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({ error: 'ID não fornecido' });
        return;
      }

      const id = parseInt(idParam, 10);

      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const removed = sqliteService.removeBooking(id);

      if (removed) {
        logger.info(`[Dashboard] Agendamento #${id} removido via dashboard`);
        res.json({ success: true, message: 'Agendamento removido' });
      } else {
        res.status(404).json({ error: 'Agendamento não encontrado' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao remover agendamento', error);
      res.status(500).json({ error: 'Erro ao remover agendamento' });
    }
  });

  // Buscar agendamentos por periodo
  router.get('/bookings/range', (req: Request, res: Response) => {
    try {
      const { unit, startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'Parametros startDate e endDate sao obrigatorios' });
        return;
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      const allBookings: Array<{
        id: number;
        unit: string;
        date: string;
        time: string;
        name: string;
        phone?: string;
        companion?: string;
        createdAt: string;
      }> = [];

      // Iterar por cada dia no range
      const current = new Date(start);
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0] ?? '';

        if (!unit || unit === 'recreio') {
          const recreio = sqliteService.getBookingsByDate('recreio', dateStr);
          allBookings.push(...recreio.map(b => ({ ...b, id: b.id ?? 0 })));
        }
        if (!unit || unit === 'bangu') {
          const bangu = sqliteService.getBookingsByDate('bangu', dateStr);
          allBookings.push(...bangu.map(b => ({ ...b, id: b.id ?? 0 })));
        }

        current.setDate(current.getDate() + 1);
      }

      // Ordenar por data e hora
      allBookings.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.time.localeCompare(b.time);
      });

      res.json({
        startDate,
        endDate,
        unit: unit || 'todas',
        total: allBookings.length,
        bookings: allBookings,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao buscar agendamentos por periodo', error);
      res.status(500).json({ error: 'Erro ao buscar agendamentos' });
    }
  });

  // Buscar agendamentos por nome ou telefone
  router.get('/bookings/search', (req: Request, res: Response) => {
    try {
      const { query, unit } = req.query;

      if (!query || (query as string).length < 2) {
        res.status(400).json({ error: 'Query deve ter pelo menos 2 caracteres' });
        return;
      }

      const searchTerm = (query as string).toLowerCase();

      // Buscar nos ultimos 30 dias e proximos 30 dias
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - 30);
      const end = new Date(today);
      end.setDate(today.getDate() + 30);

      const results: Array<{
        id: number;
        unit: string;
        date: string;
        time: string;
        name: string;
        phone?: string;
        companion?: string;
      }> = [];

      const current = new Date(start);
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0] ?? '';

        if (!unit || unit === 'recreio') {
          const recreio = sqliteService.getBookingsByDate('recreio', dateStr);
          results.push(...recreio
            .filter(b =>
              b.name.toLowerCase().includes(searchTerm) ||
              (b.phone && b.phone.includes(searchTerm)) ||
              (b.companion && b.companion.toLowerCase().includes(searchTerm))
            )
            .map(b => ({ ...b, id: b.id ?? 0 }))
          );
        }
        if (!unit || unit === 'bangu') {
          const bangu = sqliteService.getBookingsByDate('bangu', dateStr);
          results.push(...bangu
            .filter(b =>
              b.name.toLowerCase().includes(searchTerm) ||
              (b.phone && b.phone.includes(searchTerm)) ||
              (b.companion && b.companion.toLowerCase().includes(searchTerm))
            )
            .map(b => ({ ...b, id: b.id ?? 0 }))
          );
        }

        current.setDate(current.getDate() + 1);
      }

      // Ordenar por data
      results.sort((a, b) => b.date.localeCompare(a.date));

      res.json({
        query,
        total: results.length,
        bookings: results,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao buscar agendamentos', error);
      res.status(500).json({ error: 'Erro ao buscar agendamentos' });
    }
  });

  // Exportar agendamentos como CSV
  router.get('/bookings/export', (req: Request, res: Response) => {
    try {
      const { unit, startDate, endDate } = req.query;

      const start = startDate ? new Date(startDate as string) : new Date();
      const end = endDate ? new Date(endDate as string) : new Date();

      // Se nao tiver datas, pegar mes atual
      if (!startDate) {
        start.setDate(1);
      }
      if (!endDate) {
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
      }

      const allBookings: Array<{
        unit: string;
        date: string;
        time: string;
        name: string;
        phone: string;
        companion: string;
        createdAt: string;
      }> = [];

      const current = new Date(start);
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0] ?? '';

        if (!unit || unit === 'recreio') {
          const recreio = sqliteService.getBookingsByDate('recreio', dateStr);
          allBookings.push(...recreio.map(b => ({
            unit: 'Recreio',
            date: b.date,
            time: b.time,
            name: b.name,
            phone: b.phone || '',
            companion: b.companion || '',
            createdAt: b.createdAt,
          })));
        }
        if (!unit || unit === 'bangu') {
          const bangu = sqliteService.getBookingsByDate('bangu', dateStr);
          allBookings.push(...bangu.map(b => ({
            unit: 'Bangu',
            date: b.date,
            time: b.time,
            name: b.name,
            phone: b.phone || '',
            companion: b.companion || '',
            createdAt: b.createdAt,
          })));
        }

        current.setDate(current.getDate() + 1);
      }

      // Ordenar por data e hora
      allBookings.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.time.localeCompare(b.time);
      });

      // Gerar CSV
      const headers = ['Unidade', 'Data', 'Horario', 'Nome', 'Telefone', 'Acompanhante', 'Criado em'];
      const csvRows = [headers.join(';')];

      for (const booking of allBookings) {
        const row = [
          booking.unit,
          formatDateBR(booking.date),
          booking.time,
          `"${booking.name}"`,
          booking.phone,
          `"${booking.companion}"`,
          formatDateTimeBR(booking.createdAt),
        ];
        csvRows.push(row.join(';'));
      }

      const csv = csvRows.join('\n');
      const filename = `agendamentos_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('\uFEFF' + csv); // BOM para Excel reconhecer UTF-8
    } catch (error) {
      logger.error('[Dashboard] Erro ao exportar agendamentos', error);
      res.status(500).json({ error: 'Erro ao exportar agendamentos' });
    }
  });

  // Estatisticas de agendamentos
  router.get('/bookings/stats', (req: Request, res: Response) => {
    try {
      const { days = '30' } = req.query;
      const numDays = parseInt(days as string, 10) || 30;

      const today = new Date();
      const stats = {
        recreio: { total: 0, byTime: {} as Record<string, number> },
        bangu: { total: 0, byTime: {} as Record<string, number> },
        byDay: {} as Record<string, { recreio: number; bangu: number; total: number }>,
        totalGeral: 0,
      };

      for (let i = 0; i < numDays; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().split('T')[0] ?? '';

        const recreio = sqliteService.getBookingsByDate('recreio', dateStr);
        const bangu = sqliteService.getBookingsByDate('bangu', dateStr);

        stats.recreio.total += recreio.length;
        stats.bangu.total += bangu.length;
        stats.totalGeral += recreio.length + bangu.length;

        stats.byDay[dateStr] = {
          recreio: recreio.length,
          bangu: bangu.length,
          total: recreio.length + bangu.length,
        };

        // Contagem por horario
        for (const b of recreio) {
          stats.recreio.byTime[b.time] = (stats.recreio.byTime[b.time] || 0) + 1;
        }
        for (const b of bangu) {
          stats.bangu.byTime[b.time] = (stats.bangu.byTime[b.time] || 0) + 1;
        }
      }

      res.json({
        period: `Ultimos ${numDays} dias`,
        ...stats,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao obter estatisticas', error);
      res.status(500).json({ error: 'Erro ao obter estatisticas' });
    }
  });

  // ===========================================================================
  // REMINDERS
  // ===========================================================================

  router.get('/reminders/stats', (_req: Request, res: Response) => {
    try {
      const stats = sqliteService.getReminderStats();
      res.json(stats);
    } catch (error) {
      logger.error('[Dashboard] Erro ao obter estatísticas de lembretes', error);
      res.status(500).json({ error: 'Erro ao obter estatísticas' });
    }
  });

  router.get('/reminders/pending', async (_req: Request, res: Response) => {
    try {
      const pending = await reminderService.getPendingReminders();
      res.json({
        total: pending.length,
        reminders: pending,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar lembretes pendentes', error);
      res.status(500).json({ error: 'Erro ao listar lembretes pendentes' });
    }
  });

  // ===========================================================================
  // SESSIONS
  // ===========================================================================

  router.get('/sessions', (_req: Request, res: Response) => {
    try {
      const memoryStats = getMemoryStats();

      res.json({
        activeSessions: memoryStats.activeChats,
        mappings: {
          jidToLid: memoryStats.jidToLidMappings,
          lidToJid: memoryStats.lidToJidMappings,
        },
        rateLimits: memoryStats.rateLimits,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao obter estatísticas de sessões', error);
      res.status(500).json({ error: 'Erro ao obter estatísticas de sessões' });
    }
  });

  // ===========================================================================
  // QUEUES
  // ===========================================================================

  router.get('/queues', async (_req: Request, res: Response) => {
    try {
      const stats = await queueService.getStats();

      if (stats) {
        res.json(stats);
      } else {
        res.json({
          message: 'Filas não disponíveis',
          notifications: null,
          backups: null,
          cleanup: null,
          reminders: null,
        });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao obter estatísticas de filas', error);
      res.status(500).json({ error: 'Erro ao obter estatísticas de filas' });
    }
  });

  // ===========================================================================
  // METRICS
  // ===========================================================================

  router.get('/metrics', async (_req: Request, res: Response) => {
    try {
      const metrics = await metricsService.getMetrics();
      res.set('Content-Type', metricsService.getContentType());
      res.send(metrics);
    } catch (error) {
      logger.error('[Dashboard] Erro ao obter métricas', error);
      res.status(500).json({ error: 'Erro ao obter métricas' });
    }
  });

  router.get('/metrics/json', async (_req: Request, res: Response) => {
    try {
      const metrics = await metricsService.getMetricsJSON();
      res.json(metrics);
    } catch (error) {
      logger.error('[Dashboard] Erro ao obter métricas JSON', error);
      res.status(500).json({ error: 'Erro ao obter métricas' });
    }
  });

  // ===========================================================================
  // UNITS (Gerenciamento de Unidades)
  // ===========================================================================

  router.get('/units', (_req: Request, res: Response) => {
    try {
      const units = sqliteService.getUnits();
      res.json({
        total: units.length,
        units,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar unidades', error);
      res.status(500).json({ error: 'Erro ao listar unidades' });
    }
  });

  router.get('/units/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const unit = sqliteService.getUnitById(id);
      if (!unit) {
        res.status(404).json({ error: 'Unidade não encontrada' });
        return;
      }

      res.json(unit);
    } catch (error) {
      logger.error('[Dashboard] Erro ao buscar unidade', error);
      res.status(500).json({ error: 'Erro ao buscar unidade' });
    }
  });

  router.post('/units', (req: Request, res: Response) => {
    try {
      const { slug, name, address, location, workingDays, schedules, schedulesText, saturdayClass, prices, platforms, whatsappGroupId } = req.body;

      if (!slug || !name || !address || !location) {
        res.status(400).json({ error: 'Campos obrigatórios: slug, name, address, location' });
        return;
      }

      const unit = sqliteService.createUnit({
        slug,
        name,
        address,
        location,
        workingDays: workingDays || 'Segunda a Sexta',
        schedules: schedules || [],
        schedulesText,
        saturdayClass,
        prices: prices || {},
        platforms: platforms || [],
        whatsappGroupId,
        isActive: true,
      });

      if (unit) {
        logger.info(`[Dashboard] Unidade criada: ${name}`);
        res.status(201).json(unit);
      } else {
        res.status(500).json({ error: 'Erro ao criar unidade' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao criar unidade', error);
      res.status(500).json({ error: 'Erro ao criar unidade' });
    }
  });

  router.put('/units/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const { name, address, location, workingDays, schedules, schedulesText, saturdayClass, prices, platforms, whatsappGroupId, isActive } = req.body;

      const updated = sqliteService.updateUnit(id, {
        name,
        address,
        location,
        workingDays,
        schedules,
        schedulesText,
        saturdayClass,
        prices,
        platforms,
        whatsappGroupId,
        isActive,
      });

      if (updated) {
        logger.info(`[Dashboard] Unidade #${id} atualizada`);
        const unit = sqliteService.getUnitById(id);
        res.json(unit);
      } else {
        res.status(404).json({ error: 'Unidade não encontrada' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao atualizar unidade', error);
      res.status(500).json({ error: 'Erro ao atualizar unidade' });
    }
  });

  router.delete('/units/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const deleted = sqliteService.deleteUnit(id);

      if (deleted) {
        logger.info(`[Dashboard] Unidade #${id} desativada`);
        res.json({ success: true, message: 'Unidade desativada' });
      } else {
        res.status(404).json({ error: 'Unidade não encontrada' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao desativar unidade', error);
      res.status(500).json({ error: 'Erro ao desativar unidade' });
    }
  });

  // ===========================================================================
  // POLLS (Gerenciamento de Enquetes)
  // ===========================================================================

  router.get('/polls', (_req: Request, res: Response) => {
    try {
      const polls = sqliteService.getPollTemplates();
      res.json({
        total: polls.length,
        polls,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar enquetes', error);
      res.status(500).json({ error: 'Erro ao listar enquetes' });
    }
  });

  router.get('/polls/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const poll = sqliteService.getPollTemplateById(id);
      if (!poll) {
        res.status(404).json({ error: 'Enquete não encontrada' });
        return;
      }

      res.json(poll);
    } catch (error) {
      logger.error('[Dashboard] Erro ao buscar enquete', error);
      res.status(500).json({ error: 'Erro ao buscar enquete' });
    }
  });

  router.post('/polls', (req: Request, res: Response) => {
    try {
      const { name, options, targetGroup, customGroupId, scheduleType, scheduleCron, scheduleDescription } = req.body;

      if (!name || !options || !Array.isArray(options) || options.length === 0) {
        res.status(400).json({ error: 'Campos obrigatórios: name, options (array não vazio)' });
        return;
      }

      if (!targetGroup || !['recreio', 'bangu', 'custom'].includes(targetGroup)) {
        res.status(400).json({ error: 'targetGroup deve ser: recreio, bangu ou custom' });
        return;
      }

      if (targetGroup === 'custom' && !customGroupId) {
        res.status(400).json({ error: 'customGroupId é obrigatório quando targetGroup é custom' });
        return;
      }

      const poll = sqliteService.createPollTemplate({
        name,
        options,
        targetGroup,
        customGroupId,
        scheduleType: scheduleType || 'manual',
        scheduleCron,
        scheduleDescription,
        isActive: true,
      });

      if (poll) {
        logger.info(`[Dashboard] Enquete criada: ${name}`);
        res.status(201).json(poll);
      } else {
        res.status(500).json({ error: 'Erro ao criar enquete' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao criar enquete', error);
      res.status(500).json({ error: 'Erro ao criar enquete' });
    }
  });

  router.put('/polls/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const { name, options, targetGroup, customGroupId, scheduleType, scheduleCron, scheduleDescription, isActive } = req.body;

      const updated = sqliteService.updatePollTemplate(id, {
        name,
        options,
        targetGroup,
        customGroupId,
        scheduleType,
        scheduleCron,
        scheduleDescription,
        isActive,
      });

      if (updated) {
        logger.info(`[Dashboard] Enquete #${id} atualizada`);
        const poll = sqliteService.getPollTemplateById(id);
        res.json(poll);
      } else {
        res.status(404).json({ error: 'Enquete não encontrada' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao atualizar enquete', error);
      res.status(500).json({ error: 'Erro ao atualizar enquete' });
    }
  });

  router.delete('/polls/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const deleted = sqliteService.deletePollTemplate(id);

      if (deleted) {
        logger.info(`[Dashboard] Enquete #${id} desativada`);
        res.json({ success: true, message: 'Enquete desativada' });
      } else {
        res.status(404).json({ error: 'Enquete não encontrada' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao desativar enquete', error);
      res.status(500).json({ error: 'Erro ao desativar enquete' });
    }
  });

  // Enviar enquete imediatamente
  router.post('/polls/:id/send', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const poll = sqliteService.getPollTemplateById(id);
      if (!poll) {
        res.status(404).json({ error: 'Enquete não encontrada' });
        return;
      }

      // Determinar o grupo de destino
      let groupId: string;
      if (poll.targetGroup === 'recreio') {
        groupId = CONFIG.gruposWhatsApp.recreio;
      } else if (poll.targetGroup === 'bangu') {
        groupId = CONFIG.gruposWhatsApp.bangu;
      } else if (poll.customGroupId) {
        groupId = poll.customGroupId;
      } else {
        res.status(400).json({ error: 'Grupo de destino não configurado' });
        return;
      }

      // Verificar se WhatsApp está conectado
      if (!whatsappService.isConnected()) {
        res.status(503).json({ error: 'WhatsApp não está conectado' });
        return;
      }

      // Enviar enquete (passa templateId para rastreamento)
      const result = await pollHandler.createPoll(groupId, poll.name, poll.options, undefined, id);

      if (result.success) {
        logger.info(`[Dashboard] Enquete "${poll.name}" enviada para ${poll.targetGroup}`);
        res.json({
          success: true,
          message: 'Enquete enviada com sucesso',
          messageId: result.messageId,
        });
      } else {
        res.status(500).json({ error: 'Falha ao enviar enquete' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao enviar enquete', error);
      res.status(500).json({ error: 'Erro ao enviar enquete' });
    }
  });

  // ===========================================================================
  // POLL NAMES (Nomes das Enquetes por Dia)
  // ===========================================================================

  router.get('/poll-names', (_req: Request, res: Response) => {
    try {
      const names = sqliteService.getPollNames();
      res.json({
        total: names.length,
        names,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar nomes de enquetes', error);
      res.status(500).json({ error: 'Erro ao listar nomes de enquetes' });
    }
  });

  router.get('/poll-names/:day', (req: Request, res: Response) => {
    try {
      const day = req.params.day ?? '';
      const names = sqliteService.getPollNamesByDay(day);

      if (!names) {
        res.status(404).json({ error: 'Dia não encontrado' });
        return;
      }

      res.json(names);
    } catch (error) {
      logger.error('[Dashboard] Erro ao buscar nomes de enquetes', error);
      res.status(500).json({ error: 'Erro ao buscar nomes de enquetes' });
    }
  });

  router.put('/poll-names/:day', (req: Request, res: Response) => {
    try {
      const day = req.params.day ?? '';
      const { names } = req.body;

      if (!names || !Array.isArray(names)) {
        res.status(400).json({ error: 'Campo obrigatório: names (array)' });
        return;
      }

      const validDays = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
      if (!validDays.includes(day)) {
        res.status(400).json({ error: `Dia inválido. Use: ${validDays.join(', ')}` });
        return;
      }

      const updated = sqliteService.updatePollNames(day, names);

      if (updated) {
        logger.info(`[Dashboard] Nomes de enquete atualizados para ${day}`);
        res.json({ success: true, day, names });
      } else {
        res.status(500).json({ error: 'Erro ao atualizar nomes' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao atualizar nomes de enquetes', error);
      res.status(500).json({ error: 'Erro ao atualizar nomes de enquetes' });
    }
  });

  // ===========================================================================
  // SENT POLLS (Enquetes Enviadas - para fixar/desfixar)
  // ===========================================================================

  router.get('/sent-polls', (req: Request, res: Response) => {
    try {
      const groupId = req.query.groupId as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;

      const sentPolls = sqliteService.getSentPolls({ groupId, limit });
      res.json({
        total: sentPolls.length,
        sentPolls,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar enquetes enviadas', error);
      res.status(500).json({ error: 'Erro ao listar enquetes enviadas' });
    }
  });

  router.get('/sent-polls/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const sentPoll = sqliteService.getSentPollById(id);
      if (!sentPoll) {
        res.status(404).json({ error: 'Enquete enviada não encontrada' });
        return;
      }

      res.json(sentPoll);
    } catch (error) {
      logger.error('[Dashboard] Erro ao buscar enquete enviada', error);
      res.status(500).json({ error: 'Erro ao buscar enquete enviada' });
    }
  });

  // Fixar enquete
  router.post('/sent-polls/:id/pin', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const { duration } = req.body;
      const validDurations = [86400, 604800, 2592000]; // 24h, 7d, 30d

      if (!duration || !validDurations.includes(duration)) {
        res.status(400).json({
          error: 'Duração inválida. Use: 86400 (24h), 604800 (7 dias) ou 2592000 (30 dias)',
        });
        return;
      }

      const sentPoll = sqliteService.getSentPollById(id);
      if (!sentPoll) {
        res.status(404).json({ error: 'Enquete enviada não encontrada' });
        return;
      }

      // Verificar se WhatsApp está conectado
      if (!whatsappService.isConnected()) {
        res.status(503).json({ error: 'WhatsApp não está conectado' });
        return;
      }

      // Parsear messageKey
      let messageKey;
      try {
        messageKey = JSON.parse(sentPoll.messageKey);
      } catch {
        res.status(500).json({ error: 'Erro ao processar chave da mensagem' });
        return;
      }

      // Fixar mensagem
      const success = await whatsappService.pinMessage(
        sentPoll.groupId,
        messageKey,
        duration as 86400 | 604800 | 2592000
      );

      if (success) {
        // Calcular data de expiração do pin
        const pinnedUntil = new Date(Date.now() + duration * 1000).toISOString();
        sqliteService.updateSentPollPinned(id, pinnedUntil);

        const durationText = duration === 86400 ? '24 horas' : duration === 604800 ? '7 dias' : '30 dias';
        logger.info(`[Dashboard] Enquete "${sentPoll.title}" fixada por ${durationText}`);
        res.json({
          success: true,
          message: `Enquete fixada por ${durationText}`,
          pinnedUntil,
        });
      } else {
        res.status(500).json({ error: 'Falha ao fixar enquete. O bot precisa ser admin do grupo.' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao fixar enquete', error);
      res.status(500).json({ error: 'Erro ao fixar enquete' });
    }
  });

  // Desfixar enquete
  router.post('/sent-polls/:id/unpin', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const sentPoll = sqliteService.getSentPollById(id);
      if (!sentPoll) {
        res.status(404).json({ error: 'Enquete enviada não encontrada' });
        return;
      }

      // Verificar se WhatsApp está conectado
      if (!whatsappService.isConnected()) {
        res.status(503).json({ error: 'WhatsApp não está conectado' });
        return;
      }

      // Parsear messageKey
      let messageKey;
      try {
        messageKey = JSON.parse(sentPoll.messageKey);
      } catch {
        res.status(500).json({ error: 'Erro ao processar chave da mensagem' });
        return;
      }

      // Desfixar mensagem
      const success = await whatsappService.unpinMessage(sentPoll.groupId, messageKey);

      if (success) {
        sqliteService.updateSentPollPinned(id, null);
        logger.info(`[Dashboard] Enquete "${sentPoll.title}" desfixada`);
        res.json({ success: true, message: 'Enquete desfixada' });
      } else {
        res.status(500).json({ error: 'Falha ao desfixar enquete' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao desfixar enquete', error);
      res.status(500).json({ error: 'Erro ao desfixar enquete' });
    }
  });

  // Deletar enquete enviada do histórico
  router.delete('/sent-polls/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const deleted = sqliteService.deleteSentPoll(id);
      if (deleted) {
        logger.info(`[Dashboard] Enquete enviada #${id} deletada do histórico`);
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Enquete não encontrada' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao deletar enquete enviada', error);
      res.status(500).json({ error: 'Erro ao deletar enquete enviada' });
    }
  });

  // ===========================================================================
  // POLL SCHEDULES (Agendamentos de Enquetes Automáticas)
  // ===========================================================================

  router.get('/poll-schedules', (_req: Request, res: Response) => {
    try {
      const schedules = sqliteService.getPollSchedules();
      const scheduledJobs = pollHandler.getScheduledJobs();

      res.json({
        total: schedules.length,
        activeCount: schedules.filter(s => s.isActive).length,
        schedules,
        scheduledJobs,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar agendamentos de enquetes', error);
      res.status(500).json({ error: 'Erro ao listar agendamentos' });
    }
  });

  router.get('/poll-schedules/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const schedule = sqliteService.getPollScheduleById(id);
      if (!schedule) {
        res.status(404).json({ error: 'Agendamento não encontrado' });
        return;
      }

      res.json(schedule);
    } catch (error) {
      logger.error('[Dashboard] Erro ao buscar agendamento', error);
      res.status(500).json({ error: 'Erro ao buscar agendamento' });
    }
  });

  router.post('/poll-schedules', (req: Request, res: Response) => {
    try {
      const { name, description, targetGroup, customGroupId, dayOfWeek, pollOptions, scheduleHour, scheduleMinute, scheduleDays, isActive } = req.body;

      if (!name || !targetGroup || !dayOfWeek || !pollOptions || !Array.isArray(pollOptions)) {
        res.status(400).json({ error: 'Campos obrigatórios: name, targetGroup, dayOfWeek, pollOptions (array)' });
        return;
      }

      if (!['recreio', 'bangu', 'custom'].includes(targetGroup)) {
        res.status(400).json({ error: 'targetGroup deve ser: recreio, bangu ou custom' });
        return;
      }

      if (targetGroup === 'custom' && !customGroupId) {
        res.status(400).json({ error: 'customGroupId é obrigatório quando targetGroup é custom' });
        return;
      }

      if (scheduleHour === undefined || scheduleHour < 0 || scheduleHour > 23) {
        res.status(400).json({ error: 'scheduleHour deve ser entre 0 e 23' });
        return;
      }

      const schedule = sqliteService.createPollSchedule({
        name,
        description,
        targetGroup,
        customGroupId,
        dayOfWeek,
        pollOptions,
        scheduleHour,
        scheduleMinute: scheduleMinute ?? 0,
        scheduleDays: scheduleDays ?? [],
        isActive: isActive !== false,
      });

      if (schedule) {
        // Reagendar as enquetes para aplicar o novo agendamento
        pollHandler.reschedulePolls();

        logger.info(`[Dashboard] Agendamento de enquete criado: ${name}`);
        res.status(201).json(schedule);
      } else {
        res.status(500).json({ error: 'Erro ao criar agendamento' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao criar agendamento', error);
      res.status(500).json({ error: 'Erro ao criar agendamento' });
    }
  });

  router.put('/poll-schedules/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const { name, description, targetGroup, customGroupId, dayOfWeek, pollOptions, scheduleHour, scheduleMinute, scheduleDays, isActive } = req.body;

      const updated = sqliteService.updatePollSchedule(id, {
        name,
        description,
        targetGroup,
        customGroupId,
        dayOfWeek,
        pollOptions,
        scheduleHour,
        scheduleMinute,
        scheduleDays,
        isActive,
      });

      if (updated) {
        // Reagendar as enquetes para aplicar as alterações
        pollHandler.reschedulePolls();

        logger.info(`[Dashboard] Agendamento #${id} atualizado`);
        const schedule = sqliteService.getPollScheduleById(id);
        res.json(schedule);
      } else {
        res.status(404).json({ error: 'Agendamento não encontrado' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao atualizar agendamento', error);
      res.status(500).json({ error: 'Erro ao atualizar agendamento' });
    }
  });

  router.delete('/poll-schedules/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const deleted = sqliteService.deletePollSchedule(id);

      if (deleted) {
        // Reagendar as enquetes para remover o agendamento
        pollHandler.reschedulePolls();

        logger.info(`[Dashboard] Agendamento #${id} removido`);
        res.json({ success: true, message: 'Agendamento removido' });
      } else {
        res.status(404).json({ error: 'Agendamento não encontrado' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao remover agendamento', error);
      res.status(500).json({ error: 'Erro ao remover agendamento' });
    }
  });

  // Ativar/desativar agendamento
  router.post('/poll-schedules/:id/toggle', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const { isActive } = req.body;
      if (isActive === undefined) {
        res.status(400).json({ error: 'Campo obrigatório: isActive (boolean)' });
        return;
      }

      const toggled = sqliteService.togglePollSchedule(id, isActive);

      if (toggled) {
        // Reagendar as enquetes para aplicar a alteração
        pollHandler.reschedulePolls();

        logger.info(`[Dashboard] Agendamento #${id} ${isActive ? 'ativado' : 'desativado'}`);
        res.json({ success: true, isActive });
      } else {
        res.status(404).json({ error: 'Agendamento não encontrado' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao alternar agendamento', error);
      res.status(500).json({ error: 'Erro ao alternar agendamento' });
    }
  });

  // Executar enquete imediatamente
  router.post('/poll-schedules/:id/execute', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      // Verificar se WhatsApp está conectado
      if (!whatsappService.isConnected()) {
        res.status(503).json({ error: 'WhatsApp não está conectado' });
        return;
      }

      const success = await pollHandler.executeScheduleById(id);

      if (success) {
        logger.info(`[Dashboard] Agendamento #${id} executado manualmente`);
        res.json({ success: true, message: 'Enquete enviada com sucesso' });
      } else {
        res.status(500).json({ error: 'Falha ao enviar enquete' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao executar agendamento', error);
      res.status(500).json({ error: 'Erro ao executar agendamento' });
    }
  });

  // Reagendar todas as enquetes
  router.post('/poll-schedules/reschedule', (_req: Request, res: Response) => {
    try {
      pollHandler.reschedulePolls();
      const scheduledJobs = pollHandler.getScheduledJobs();

      logger.info('[Dashboard] Enquetes reagendadas');
      res.json({ success: true, scheduledJobs });
    } catch (error) {
      logger.error('[Dashboard] Erro ao reagendar enquetes', error);
      res.status(500).json({ error: 'Erro ao reagendar enquetes' });
    }
  });

  // ===========================================================================
  // SETTINGS (Configurações Gerais)
  // ===========================================================================

  router.get('/settings', (_req: Request, res: Response) => {
    try {
      const settings = sqliteService.getBotSettings();
      res.json(settings);
    } catch (error) {
      logger.error('[Dashboard] Erro ao obter configurações', error);
      res.status(500).json({ error: 'Erro ao obter configurações' });
    }
  });

  router.put('/settings', (req: Request, res: Response) => {
    try {
      const updates = req.body;

      // Se está pausando o bot, registrar quando e por quem
      if (updates.botPaused === true) {
        updates.pausedAt = new Date().toISOString();
        updates.pausedBy = 'dashboard';
      } else if (updates.botPaused === false) {
        updates.pauseReason = '';
        updates.pausedAt = '';
        updates.pausedBy = '';
      }

      const success = sqliteService.updateBotSettings(updates);

      if (success) {
        logger.info('[Dashboard] Configurações atualizadas');
        const newSettings = sqliteService.getBotSettings();
        res.json(newSettings);
      } else {
        res.status(500).json({ error: 'Erro ao atualizar configurações' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao atualizar configurações', error);
      res.status(500).json({ error: 'Erro ao atualizar configurações' });
    }
  });

  // Pausar/Despausar bot rapidamente
  router.post('/settings/pause', (req: Request, res: Response) => {
    try {
      const { reason } = req.body;

      const success = sqliteService.updateBotSettings({
        botPaused: true,
        pauseReason: reason || 'Pausado via dashboard',
        pausedAt: new Date().toISOString(),
        pausedBy: 'dashboard',
      });

      if (success) {
        logger.info(`[Dashboard] Bot pausado: ${reason || 'Sem motivo'}`);
        res.json({ success: true, message: 'Bot pausado' });
      } else {
        res.status(500).json({ error: 'Erro ao pausar bot' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao pausar bot', error);
      res.status(500).json({ error: 'Erro ao pausar bot' });
    }
  });

  router.post('/settings/resume', (_req: Request, res: Response) => {
    try {
      const success = sqliteService.updateBotSettings({
        botPaused: false,
        pauseReason: '',
        pausedAt: '',
        pausedBy: '',
      });

      if (success) {
        logger.info('[Dashboard] Bot retomado');
        res.json({ success: true, message: 'Bot retomado' });
      } else {
        res.status(500).json({ error: 'Erro ao retomar bot' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao retomar bot', error);
      res.status(500).json({ error: 'Erro ao retomar bot' });
    }
  });

  // Verificar status do bot (útil para messageHandler)
  router.get('/settings/bot-status', (_req: Request, res: Response) => {
    try {
      const status = sqliteService.shouldBotRespond();
      const settings = sqliteService.getBotSettings();

      res.json({
        shouldRespond: status.respond,
        message: status.message,
        botPaused: settings.botPaused,
        pauseReason: settings.pauseReason,
        pausedAt: settings.pausedAt,
        workingHoursEnabled: settings.workingHoursEnabled,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao verificar status do bot', error);
      res.status(500).json({ error: 'Erro ao verificar status' });
    }
  });

  // ===========================================================================
  // STUDENTS (Alunos)
  // ===========================================================================

  router.get('/students', (req: Request, res: Response) => {
    try {
      const { unit, status } = req.query;
      const students = sqliteService.getStudents({
        unit: unit as string,
        status: status as string,
      });

      res.json({
        total: students.length,
        students,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar alunos', error);
      res.status(500).json({ error: 'Erro ao listar alunos' });
    }
  });

  router.get('/students/with-status', (_req: Request, res: Response) => {
    try {
      const students = sqliteService.getStudentsWithPaymentStatus();
      const overdue = students.filter(s => s.isOverdue);
      const upToDate = students.filter(s => !s.isOverdue);

      res.json({
        total: students.length,
        overdueCount: overdue.length,
        upToDateCount: upToDate.length,
        students,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar alunos com status', error);
      res.status(500).json({ error: 'Erro ao listar alunos' });
    }
  });

  router.get('/students/overdue', (_req: Request, res: Response) => {
    try {
      const students = sqliteService.getOverdueStudents();

      res.json({
        total: students.length,
        students,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar alunos inadimplentes', error);
      res.status(500).json({ error: 'Erro ao listar alunos' });
    }
  });

  router.get('/students/due-today', (_req: Request, res: Response) => {
    try {
      const students = sqliteService.getStudentsDueToday();

      res.json({
        total: students.length,
        students,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar alunos com vencimento hoje', error);
      res.status(500).json({ error: 'Erro ao listar alunos' });
    }
  });

  router.get('/students/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const student = sqliteService.getStudentById(id);
      if (!student) {
        res.status(404).json({ error: 'Aluno não encontrado' });
        return;
      }

      const payments = sqliteService.getPaymentsByStudent(id);

      res.json({ ...student, payments });
    } catch (error) {
      logger.error('[Dashboard] Erro ao buscar aluno', error);
      res.status(500).json({ error: 'Erro ao buscar aluno' });
    }
  });

  router.post('/students', (req: Request, res: Response) => {
    try {
      const { name, phone, email, unit, plan, planValue, dueDay, startDate, status, notes } = req.body;

      if (!name || !phone || !unit || !plan || planValue === undefined || !dueDay || !startDate) {
        res.status(400).json({ error: 'Campos obrigatórios: name, phone, unit, plan, planValue, dueDay, startDate' });
        return;
      }

      if (!['recreio', 'bangu'].includes(unit)) {
        res.status(400).json({ error: 'unit deve ser: recreio ou bangu' });
        return;
      }

      if (dueDay < 1 || dueDay > 31) {
        res.status(400).json({ error: 'dueDay deve ser entre 1 e 31' });
        return;
      }

      const student = sqliteService.createStudent({
        name,
        phone,
        email,
        unit,
        plan,
        planValue: Math.round(planValue * 100), // Converter para centavos
        dueDay,
        startDate,
        status: status || 'active',
        notes,
      });

      if (student) {
        logger.info(`[Dashboard] Aluno criado: ${name}`);
        res.status(201).json(student);
      } else {
        res.status(500).json({ error: 'Erro ao criar aluno' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao criar aluno', error);
      res.status(500).json({ error: 'Erro ao criar aluno' });
    }
  });

  router.put('/students/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const { name, phone, email, unit, plan, planValue, dueDay, startDate, status, notes } = req.body;

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (email !== undefined) updateData.email = email;
      if (unit !== undefined) updateData.unit = unit;
      if (plan !== undefined) updateData.plan = plan;
      if (planValue !== undefined) updateData.planValue = Math.round(planValue * 100);
      if (dueDay !== undefined) updateData.dueDay = dueDay;
      if (startDate !== undefined) updateData.startDate = startDate;
      if (status !== undefined) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;

      const updated = sqliteService.updateStudent(id, updateData);

      if (updated) {
        logger.info(`[Dashboard] Aluno #${id} atualizado`);
        const student = sqliteService.getStudentById(id);
        res.json(student);
      } else {
        res.status(404).json({ error: 'Aluno não encontrado' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao atualizar aluno', error);
      res.status(500).json({ error: 'Erro ao atualizar aluno' });
    }
  });

  router.delete('/students/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const deleted = sqliteService.deleteStudent(id);

      if (deleted) {
        logger.info(`[Dashboard] Aluno #${id} removido`);
        res.json({ success: true, message: 'Aluno removido' });
      } else {
        res.status(404).json({ error: 'Aluno não encontrado' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao remover aluno', error);
      res.status(500).json({ error: 'Erro ao remover aluno' });
    }
  });

  // ===========================================================================
  // PAYMENTS (Pagamentos)
  // ===========================================================================

  router.get('/payments', (req: Request, res: Response) => {
    try {
      const { studentId, referenceMonth, startDate, endDate } = req.query;

      const payments = sqliteService.getPayments({
        studentId: studentId ? parseInt(studentId as string, 10) : undefined,
        referenceMonth: referenceMonth as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });

      const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

      res.json({
        total: payments.length,
        totalAmount,
        payments,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar pagamentos', error);
      res.status(500).json({ error: 'Erro ao listar pagamentos' });
    }
  });

  router.get('/payments/report/:month', (req: Request, res: Response) => {
    try {
      const month = req.params.month; // formato YYYY-MM

      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        res.status(400).json({ error: 'Formato de mês inválido. Use YYYY-MM' });
        return;
      }

      const report = sqliteService.getMonthlyReport(month);

      res.json(report);
    } catch (error) {
      logger.error('[Dashboard] Erro ao gerar relatório', error);
      res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
  });

  router.post('/payments', (req: Request, res: Response) => {
    try {
      const { studentId, amount, referenceMonth, paymentDate, paymentMethod, notes } = req.body;

      if (!studentId || amount === undefined || !referenceMonth || !paymentDate || !paymentMethod) {
        res.status(400).json({ error: 'Campos obrigatórios: studentId, amount, referenceMonth, paymentDate, paymentMethod' });
        return;
      }

      if (!['pix', 'dinheiro', 'cartao', 'transferencia', 'outro'].includes(paymentMethod)) {
        res.status(400).json({ error: 'paymentMethod deve ser: pix, dinheiro, cartao, transferencia ou outro' });
        return;
      }

      // Verificar se aluno existe
      const student = sqliteService.getStudentById(studentId);
      if (!student) {
        res.status(404).json({ error: 'Aluno não encontrado' });
        return;
      }

      const payment = sqliteService.createPayment({
        studentId,
        amount: Math.round(amount * 100), // Converter para centavos
        referenceMonth,
        paymentDate,
        paymentMethod,
        notes,
      });

      if (payment) {
        logger.info(`[Dashboard] Pagamento registrado para aluno #${studentId}: R$ ${(amount).toFixed(2)}`);
        res.status(201).json(payment);
      } else {
        res.status(500).json({ error: 'Erro ao registrar pagamento' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao registrar pagamento', error);
      res.status(500).json({ error: 'Erro ao registrar pagamento' });
    }
  });

  router.delete('/payments/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const deleted = sqliteService.deletePayment(id);

      if (deleted) {
        logger.info(`[Dashboard] Pagamento #${id} removido`);
        res.json({ success: true, message: 'Pagamento removido' });
      } else {
        res.status(404).json({ error: 'Pagamento não encontrado' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao remover pagamento', error);
      res.status(500).json({ error: 'Erro ao remover pagamento' });
    }
  });

  // ===========================================================================
  // BILLING (Cobrança)
  // ===========================================================================

  router.post('/billing/send-reminder/:studentId', async (req: Request, res: Response) => {
    try {
      const studentId = parseInt(req.params.studentId ?? '0', 10);
      if (isNaN(studentId)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const student = sqliteService.getStudentById(studentId);
      if (!student) {
        res.status(404).json({ error: 'Aluno não encontrado' });
        return;
      }

      if (!whatsappService.isConnected()) {
        res.status(503).json({ error: 'WhatsApp não está conectado' });
        return;
      }

      const sock = whatsappService.getSocket();
      if (!sock) {
        res.status(503).json({ error: 'Socket não disponível' });
        return;
      }

      // Formatar número do telefone
      let phone = student.phone.replace(/\D/g, '');
      if (!phone.startsWith('55')) {
        phone = '55' + phone;
      }
      const jid = phone + '@s.whatsapp.net';

      // Mensagem de cobrança
      const message = `Fala, craque.
Bom dia ⚡️⚡️⚡️
Passando pra lembrar que sua mensalidade vence hoje.
Ter você conosco é muito importante pra nós.
E aí, vamos continuar melhorando juntos?!

Chave pix: ramoslks7@gmail.com (Lukas Ramos)`;

      await sock.sendMessage(jid, { text: message });

      logger.info(`[Dashboard] Lembrete de cobrança enviado para ${student.name} (${student.phone})`);
      res.json({ success: true, message: 'Lembrete enviado com sucesso' });
    } catch (error) {
      logger.error('[Dashboard] Erro ao enviar lembrete', error);
      res.status(500).json({ error: 'Erro ao enviar lembrete' });
    }
  });

  router.post('/billing/send-bulk-reminders', async (_req: Request, res: Response) => {
    try {
      if (!whatsappService.isConnected()) {
        res.status(503).json({ error: 'WhatsApp não está conectado' });
        return;
      }

      const sock = whatsappService.getSocket();
      if (!sock) {
        res.status(503).json({ error: 'Socket não disponível' });
        return;
      }

      const students = sqliteService.getStudentsDueToday();
      const results: { name: string; phone: string; success: boolean; error?: string }[] = [];

      const message = `Fala, craque.
Bom dia ⚡️⚡️⚡️
Passando pra lembrar que sua mensalidade vence hoje.
Ter você conosco é muito importante pra nós.
E aí, vamos continuar melhorando juntos?!

Chave pix: ramoslks7@gmail.com (Lukas Ramos)`;

      for (const student of students) {
        try {
          let phone = student.phone.replace(/\D/g, '');
          if (!phone.startsWith('55')) {
            phone = '55' + phone;
          }
          const jid = phone + '@s.whatsapp.net';

          await sock.sendMessage(jid, { text: message });

          // Delay entre mensagens para evitar bloqueio
          await new Promise(resolve => setTimeout(resolve, 2000));

          results.push({ name: student.name, phone: student.phone, success: true });
          logger.info(`[Dashboard] Lembrete enviado para ${student.name}`);
        } catch (error) {
          results.push({ name: student.name, phone: student.phone, success: false, error: String(error) });
          logger.error(`[Dashboard] Erro ao enviar lembrete para ${student.name}`, error);
        }
      }

      res.json({
        total: students.length,
        sent: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao enviar lembretes em lote', error);
      res.status(500).json({ error: 'Erro ao enviar lembretes' });
    }
  });

  // ===========================================================================
  // BILLING CONFIG
  // ===========================================================================

  // Obter configuração de cobrança automática
  router.get('/billing/config', (_req: Request, res: Response) => {
    try {
      const config = billingHandler.getConfig();
      const jobInfo = billingHandler.getScheduledJob();
      res.json({
        ...config,
        nextExecution: jobInfo.nextExecution,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao obter config de cobrança', error);
      res.status(500).json({ error: 'Erro ao obter configuração' });
    }
  });

  // Atualizar configuração de cobrança automática
  router.put('/billing/config', (req: Request, res: Response) => {
    try {
      const { enabled, time, daysOfWeek, message, pixKey, pixName } = req.body;

      const config: Record<string, unknown> = {};
      if (enabled !== undefined) config.enabled = Boolean(enabled);
      if (time) config.time = String(time);
      if (daysOfWeek) config.daysOfWeek = Array.isArray(daysOfWeek) ? daysOfWeek.map(Number) : [];
      if (message) config.message = String(message);
      if (pixKey) config.pixKey = String(pixKey);
      if (pixName) config.pixName = String(pixName);

      billingHandler.saveConfig(config);
      billingHandler.rescheduleBilling();

      const updatedConfig = billingHandler.getConfig();
      const jobInfo = billingHandler.getScheduledJob();

      res.json({
        success: true,
        config: {
          ...updatedConfig,
          nextExecution: jobInfo.nextExecution,
        },
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao atualizar config de cobrança', error);
      res.status(500).json({ error: 'Erro ao atualizar configuração' });
    }
  });

  // Executar cobrança manual (enviar para todos com vencimento hoje)
  router.post('/billing/execute-now', async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, message: 'Cobrança iniciada em segundo plano' });
      // Executar em segundo plano
      billingHandler.sendDailyReminders().catch(error => {
        logger.error('[Dashboard] Erro ao executar cobrança manual', error);
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao iniciar cobrança manual', error);
      res.status(500).json({ error: 'Erro ao iniciar cobrança' });
    }
  });

  // ===========================================================================
  // CHECK-IN STUDENTS (Alunos de Plataforma)
  // ===========================================================================

  router.get('/checkin-students', (req: Request, res: Response) => {
    try {
      const { unit, platform, status } = req.query;
      const students = sqliteService.getCheckinStudents({
        unit: unit as string,
        platform: platform as string,
        status: status as string,
      });

      res.json({
        total: students.length,
        students,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar alunos de check-in', error);
      res.status(500).json({ error: 'Erro ao listar alunos' });
    }
  });

  router.get('/checkin-students/summary', (_req: Request, res: Response) => {
    try {
      const summary = sqliteService.getCheckinSummary();
      res.json(summary);
    } catch (error) {
      logger.error('[Dashboard] Erro ao obter resumo de check-ins', error);
      res.status(500).json({ error: 'Erro ao obter resumo' });
    }
  });

  router.get('/checkin-students/owing', (_req: Request, res: Response) => {
    try {
      const students = sqliteService.getCheckinStudentsOwing();
      res.json({
        total: students.length,
        students,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar alunos devendo', error);
      res.status(500).json({ error: 'Erro ao listar alunos' });
    }
  });

  router.get('/checkin-students/with-credits', (_req: Request, res: Response) => {
    try {
      const students = sqliteService.getCheckinStudentsWithCredits();
      res.json({
        total: students.length,
        students,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar alunos com créditos', error);
      res.status(500).json({ error: 'Erro ao listar alunos' });
    }
  });

  router.get('/checkin-students/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const student = sqliteService.getCheckinStudentById(id);
      if (!student) {
        res.status(404).json({ error: 'Aluno não encontrado' });
        return;
      }

      const transactions = sqliteService.getCheckinTransactionsByStudent(id);

      res.json({ ...student, transactions });
    } catch (error) {
      logger.error('[Dashboard] Erro ao buscar aluno de check-in', error);
      res.status(500).json({ error: 'Erro ao buscar aluno' });
    }
  });

  router.post('/checkin-students', (req: Request, res: Response) => {
    try {
      const { name, phone, unit, platform, balance, status, notes } = req.body;

      if (!name || !phone || !unit || !platform) {
        res.status(400).json({ error: 'Campos obrigatórios: name, phone, unit, platform' });
        return;
      }

      if (!['recreio', 'bangu'].includes(unit)) {
        res.status(400).json({ error: 'unit deve ser: recreio ou bangu' });
        return;
      }

      if (!['wellhub', 'totalpass', 'gurupass'].includes(platform)) {
        res.status(400).json({ error: 'platform deve ser: wellhub, totalpass ou gurupass' });
        return;
      }

      const student = sqliteService.createCheckinStudent({
        name,
        phone,
        unit,
        platform,
        balance: balance || 0,
        status: status || 'active',
        notes,
      });

      if (student) {
        logger.info(`[Dashboard] Aluno de check-in criado: ${name}`);
        res.status(201).json(student);
      } else {
        res.status(500).json({ error: 'Erro ao criar aluno' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao criar aluno de check-in', error);
      res.status(500).json({ error: 'Erro ao criar aluno' });
    }
  });

  router.put('/checkin-students/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const { name, phone, unit, platform, balance, status, notes } = req.body;

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (unit !== undefined) updateData.unit = unit;
      if (platform !== undefined) updateData.platform = platform;
      if (balance !== undefined) updateData.balance = balance;
      if (status !== undefined) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;

      const updated = sqliteService.updateCheckinStudent(id, updateData);

      if (updated) {
        logger.info(`[Dashboard] Aluno de check-in #${id} atualizado`);
        const student = sqliteService.getCheckinStudentById(id);
        res.json(student);
      } else {
        res.status(404).json({ error: 'Aluno não encontrado' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao atualizar aluno de check-in', error);
      res.status(500).json({ error: 'Erro ao atualizar aluno' });
    }
  });

  router.delete('/checkin-students/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const deleted = sqliteService.deleteCheckinStudent(id);

      if (deleted) {
        logger.info(`[Dashboard] Aluno de check-in #${id} removido`);
        res.json({ success: true, message: 'Aluno removido' });
      } else {
        res.status(404).json({ error: 'Aluno não encontrado' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao remover aluno de check-in', error);
      res.status(500).json({ error: 'Erro ao remover aluno' });
    }
  });

  // ===========================================================================
  // CHECK-IN TRANSACTIONS (Transações de Check-in)
  // ===========================================================================

  router.get('/checkin-transactions', (req: Request, res: Response) => {
    try {
      const { studentId, type, startDate, endDate } = req.query;

      const transactions = sqliteService.getCheckinTransactions({
        studentId: studentId ? parseInt(studentId as string, 10) : undefined,
        type: type as string,
        startDate: startDate as string,
        endDate: endDate as string,
      });

      res.json({
        total: transactions.length,
        transactions,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar transações de check-in', error);
      res.status(500).json({ error: 'Erro ao listar transações' });
    }
  });

  router.post('/checkin-transactions', (req: Request, res: Response) => {
    try {
      const { studentId, type, amount, date, notes } = req.body;

      if (!studentId || !type || !date) {
        res.status(400).json({ error: 'Campos obrigatórios: studentId, type, date' });
        return;
      }

      if (!['credit', 'debit'].includes(type)) {
        res.status(400).json({ error: 'type deve ser: credit (fez check-in) ou debit (usou na aula)' });
        return;
      }

      // Verificar se aluno existe
      const student = sqliteService.getCheckinStudentById(studentId);
      if (!student) {
        res.status(404).json({ error: 'Aluno não encontrado' });
        return;
      }

      const transaction = sqliteService.createCheckinTransaction({
        studentId,
        type,
        amount: amount || 1,
        date,
        notes,
      });

      if (transaction) {
        // Buscar aluno atualizado para retornar o novo saldo
        const updatedStudent = sqliteService.getCheckinStudentById(studentId);
        logger.info(`[Dashboard] Transação de check-in criada: ${type} para aluno #${studentId}`);
        res.status(201).json({
          transaction,
          newBalance: updatedStudent?.balance,
        });
      } else {
        res.status(500).json({ error: 'Erro ao criar transação' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao criar transação de check-in', error);
      res.status(500).json({ error: 'Erro ao criar transação' });
    }
  });

  router.delete('/checkin-transactions/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id ?? '0', 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const deleted = sqliteService.deleteCheckinTransaction(id);

      if (deleted) {
        logger.info(`[Dashboard] Transação de check-in #${id} removida`);
        res.json({ success: true, message: 'Transação removida e saldo revertido' });
      } else {
        res.status(404).json({ error: 'Transação não encontrada' });
      }
    } catch (error) {
      logger.error('[Dashboard] Erro ao remover transação de check-in', error);
      res.status(500).json({ error: 'Erro ao remover transação' });
    }
  });

  return router;
}

// ===========================================================================
// HELPERS
// ===========================================================================

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatDateBR(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function formatDateTimeBR(isoStr: string): string {
  try {
    const date = new Date(isoStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return isoStr;
  }
}
