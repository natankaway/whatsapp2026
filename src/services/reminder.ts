import { sqliteService } from '../database/index.js';
import logger from '../utils/logger.js';

// =============================================================================
// REMINDER SERVICE
// =============================================================================
// Gerencia lembretes automáticos de aulas para os alunos.
// Envia lembretes 24h e 2h antes das aulas agendadas.
// =============================================================================

export interface ReminderRecord {
  id?: number;
  bookingId: number;
  type: 'reminder_24h' | 'reminder_2h' | 'confirmation';
  status: 'pending' | 'sent' | 'failed' | 'confirmed';
  scheduledFor: string;
  sentAt?: string;
  phone?: string;
  response?: string;
  createdAt: string;
}

export interface PendingReminderWithBooking {
  id: number;
  bookingId: number;
  type: string;
  status: string;
  scheduledFor: string;
  phone: string | null;
  bookingName: string;
  bookingDate: string;
  bookingTime: string;
  bookingUnit: string;
}

export interface ReminderConfig {
  enabled: boolean;
  reminder24h: boolean;
  reminder2h: boolean;
  confirmationRequired: boolean;
  confirmationDeadlineHours: number;
}

// Templates de mensagens
export const REMINDER_TEMPLATES = {
  reminder_24h: (name: string, date: string, time: string, unit: string) => `
🔔 *Lembrete de Aula - CT LK Futevôlei*

Olá ${name}! 👋

Sua aula está marcada para *amanhã*!

📅 *Data:* ${date}
⏰ *Horário:* ${time}
📍 *Local:* ${unit}

Para confirmar sua presença, responda com:
✅ *CONFIRMAR* - Vou comparecer
❌ *CANCELAR* - Não poderei ir

_Confirme até 2 horas antes da aula._
  `.trim(),

  reminder_2h: (name: string, time: string, unit: string) => `
⚡ *Lembrete Final - CT LK Futevôlei*

${name}, sua aula é *HOJE* às *${time}*!

📍 *Local:* ${unit}

Nos vemos em breve! 🏐

_Caso não possa comparecer, avise o mais rápido possível._
  `.trim(),

  confirmation_received: (name: string) => `
✅ *Presença Confirmada!*

${name}, sua presença foi confirmada com sucesso!

Nos vemos na aula! 🏐💪
  `.trim(),

  cancellation_received: (name: string) => `
❌ *Cancelamento Registrado*

${name}, seu cancelamento foi registrado.

Você foi removido(a) da lista e a vaga foi liberada.

Esperamos você em outra oportunidade! 👋
  `.trim(),

  no_confirmation: (name: string) => `
⚠️ *Aviso - Sem Confirmação*

${name}, você não confirmou presença na aula de hoje.

Se ainda pretende comparecer, responda *CONFIRMAR*.

Caso contrário, sua vaga poderá ser liberada.
  `.trim(),
};

class ReminderService {
  private config: ReminderConfig = {
    enabled: true,
    reminder24h: true,
    reminder2h: true,
    confirmationRequired: true,
    confirmationDeadlineHours: 2,
  };

  // ===========================================================================
  // CONFIGURAÇÃO
  // ===========================================================================

  setConfig(config: Partial<ReminderConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[Reminder] Configuração atualizada', { config: this.config });
  }

  getConfig(): ReminderConfig {
    return { ...this.config };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  // ===========================================================================
  // AGENDAMENTO DE LEMBRETES
  // ===========================================================================

  /**
   * Agenda lembretes para um novo booking
   */
  async scheduleReminders(bookingId: number, bookingDate: string, bookingTime: string, phone?: string): Promise<void> {
    if (!this.config.enabled) {
      logger.debug('[Reminder] Serviço desabilitado, ignorando agendamento');
      return;
    }

    try {
      // Calcular horário da aula
      const dateParts = bookingDate.split('-').map(Number);
      const timeParts = bookingTime.split(':').map(Number);
      const year = dateParts[0] ?? 0;
      const month = dateParts[1] ?? 1;
      const day = dateParts[2] ?? 1;
      const hour = timeParts[0] ?? 0;
      const minute = timeParts[1] ?? 0;
      const classTime = new Date(year, month - 1, day, hour, minute);

      const now = new Date();

      // Lembrete 24h antes
      if (this.config.reminder24h) {
        const reminder24h = new Date(classTime.getTime() - 24 * 60 * 60 * 1000);
        if (reminder24h > now) {
          await this.createReminder({
            bookingId,
            type: 'reminder_24h',
            status: 'pending',
            scheduledFor: reminder24h.toISOString(),
            phone,
            createdAt: now.toISOString(),
          });
          logger.debug(`[Reminder] Lembrete 24h agendado para ${reminder24h.toISOString()}`);
        }
      }

      // Lembrete 2h antes
      if (this.config.reminder2h) {
        const reminder2h = new Date(classTime.getTime() - 2 * 60 * 60 * 1000);
        if (reminder2h > now) {
          await this.createReminder({
            bookingId,
            type: 'reminder_2h',
            status: 'pending',
            scheduledFor: reminder2h.toISOString(),
            phone,
            createdAt: now.toISOString(),
          });
          logger.debug(`[Reminder] Lembrete 2h agendado para ${reminder2h.toISOString()}`);
        }
      }

      logger.info(`[Reminder] Lembretes agendados para booking #${bookingId}`);
    } catch (error) {
      logger.error(`[Reminder] Erro ao agendar lembretes para booking #${bookingId}`, error);
    }
  }

  /**
   * Cria registro de lembrete no banco
   */
  private async createReminder(reminder: Omit<ReminderRecord, 'id'>): Promise<ReminderRecord | null> {
    try {
      return sqliteService.addReminder(reminder);
    } catch (error) {
      logger.error('[Reminder] Erro ao criar lembrete', error);
      return null;
    }
  }

  // ===========================================================================
  // PROCESSAMENTO DE LEMBRETES
  // ===========================================================================

  /**
   * Busca lembretes pendentes que devem ser enviados
   */
  async getPendingReminders(): Promise<PendingReminderWithBooking[]> {
    try {
      const now = new Date().toISOString();
      return sqliteService.getPendingReminders(now);
    } catch (error) {
      logger.error('[Reminder] Erro ao buscar lembretes pendentes', error);
      return [];
    }
  }

  /**
   * Marca lembrete como enviado
   */
  async markAsSent(reminderId: number): Promise<boolean> {
    try {
      return sqliteService.updateReminderStatus(reminderId, 'sent', new Date().toISOString());
    } catch (error) {
      logger.error(`[Reminder] Erro ao marcar lembrete #${reminderId} como enviado`, error);
      return false;
    }
  }

  /**
   * Marca lembrete como falho
   */
  async markAsFailed(reminderId: number, reason?: string): Promise<boolean> {
    try {
      return sqliteService.updateReminderStatus(reminderId, 'failed', undefined, reason);
    } catch (error) {
      logger.error(`[Reminder] Erro ao marcar lembrete #${reminderId} como falho`, error);
      return false;
    }
  }

  // ===========================================================================
  // CONFIRMAÇÃO DE PRESENÇA
  // ===========================================================================

  /**
   * Processa confirmação de presença do aluno
   */
  async processConfirmation(phone: string, confirmed: boolean): Promise<{ success: boolean; message: string }> {
    try {
      // Buscar lembretes pendentes para este telefone
      const pendingReminders = sqliteService.getPendingRemindersByPhone(phone);

      if (pendingReminders.length === 0) {
        return {
          success: false,
          message: 'Não encontramos agendamentos pendentes de confirmação para este número.',
        };
      }

      // Pegar o lembrete mais recente
      const reminder = pendingReminders[0];

      if (!reminder) {
        return {
          success: false,
          message: 'Não encontramos agendamentos pendentes de confirmação para este número.',
        };
      }

      if (confirmed) {
        // Confirmar presença
        sqliteService.updateReminderStatus(reminder.id, 'confirmed');

        return {
          success: true,
          message: 'Presença confirmada com sucesso!',
        };
      } else {
        // Cancelar agendamento
        if (reminder.bookingId) {
          sqliteService.removeBooking(reminder.bookingId);
        }
        sqliteService.updateReminderStatus(reminder.id, 'failed', undefined, 'Cancelado pelo aluno');

        return {
          success: true,
          message: 'Agendamento cancelado. Esperamos você em outra oportunidade!',
        };
      }
    } catch (error) {
      logger.error('[Reminder] Erro ao processar confirmação', error);
      return {
        success: false,
        message: 'Ocorreu um erro ao processar sua resposta. Tente novamente.',
      };
    }
  }

  // ===========================================================================
  // GERAÇÃO DE MENSAGENS
  // ===========================================================================

  /**
   * Gera mensagem de lembrete baseada no tipo
   */
  generateReminderMessage(
    type: 'reminder_24h' | 'reminder_2h',
    name: string,
    date: string,
    time: string,
    unit: string
  ): string {
    if (type === 'reminder_24h') {
      return REMINDER_TEMPLATES.reminder_24h(name, date, time, unit);
    } else {
      return REMINDER_TEMPLATES.reminder_2h(name, time, unit);
    }
  }

  /**
   * Gera mensagem de confirmação
   */
  generateConfirmationMessage(name: string, confirmed: boolean): string {
    return confirmed
      ? REMINDER_TEMPLATES.confirmation_received(name)
      : REMINDER_TEMPLATES.cancellation_received(name);
  }

  // ===========================================================================
  // ESTATÍSTICAS
  // ===========================================================================

  /**
   * Retorna estatísticas de lembretes
   */
  async getStats(): Promise<{
    pending: number;
    sent: number;
    confirmed: number;
    failed: number;
  }> {
    try {
      return sqliteService.getReminderStats();
    } catch (error) {
      logger.error('[Reminder] Erro ao buscar estatísticas', error);
      return { pending: 0, sent: 0, confirmed: 0, failed: 0 };
    }
  }

  // ===========================================================================
  // LIMPEZA
  // ===========================================================================

  /**
   * Remove lembretes antigos
   */
  async cleanupOldReminders(daysOld: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      return sqliteService.cleanupOldReminders(cutoffDate.toISOString());
    } catch (error) {
      logger.error('[Reminder] Erro ao limpar lembretes antigos', error);
      return 0;
    }
  }
}

// Singleton
const reminderService = new ReminderService();
export default reminderService;
