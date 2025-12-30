import { Router, Request, Response } from 'express';
import { sqliteService } from '../database/index.js';
import whatsappService from '../services/whatsapp.js';
import queueService from '../infra/queue.js';
import metricsService from '../infra/metrics.js';
import reminderService from '../services/reminder.js';
import { getMemoryStats } from '../events/messageHandler.js';
import logger from '../utils/logger.js';

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

      res.json({
        whatsapp: {
          state: whatsappState,
          connected: whatsappService.isConnected(),
          stable: whatsappService.isConnectionStable(),
          uptime: whatsappUptime,
          uptimeFormatted: formatUptime(whatsappUptime),
        },
        queue: queueStats,
        reminders: reminderStats,
        memory: memoryStats,
        system: {
          uptime: process.uptime(),
          uptimeFormatted: formatUptime(process.uptime() * 1000),
          memoryUsage: process.memoryUsage(),
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
      const { unit, date } = req.query;

      if (!unit || !date) {
        res.status(400).json({ error: 'Parâmetros unit e date são obrigatórios' });
        return;
      }

      const bookings = sqliteService.getBookingsByDate(
        unit as 'recreio' | 'bangu',
        date as string
      );

      res.json({
        unit,
        date,
        total: bookings.length,
        bookings,
      });
    } catch (error) {
      logger.error('[Dashboard] Erro ao listar agendamentos', error);
      res.status(500).json({ error: 'Erro ao listar agendamentos' });
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
