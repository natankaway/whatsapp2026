import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import type { BookingDetails } from '../types/index.js';
import notificationService from '../services/notification.js';
import backupService from '../services/backup.js';
import reminderService from '../services/reminder.js';
import { sqliteService } from '../database/index.js';
import logger from '../utils/logger.js';

// =============================================================================
// QUEUE SERVICE - BULLMQ
// =============================================================================
// Gerencia filas de processamento assíncrono para operações que podem ser
// deferidas, como notificações e backups.
// =============================================================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Parsear URL do Redis
function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port) || 6379,
      password: parsed.password || undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

const redisConnection = parseRedisUrl(REDIS_URL);

// =============================================================================
// TIPOS DE JOBS
// =============================================================================

export interface NotificationJob {
  type: 'telegram' | 'whatsapp';
  booking: BookingDetails;
  attempt?: number;
}

export interface BackupJob {
  type: 'daily' | 'manual';
  timestamp: string;
}

export interface CleanupJob {
  type: 'sessions' | 'bookings' | 'logs' | 'reminders';
  olderThanDays: number;
}

export interface ReminderJob {
  action: 'process_pending' | 'send_single';
  reminderId?: number;
}

// Union type para referência (usado internamente pelos workers)
export type JobData = NotificationJob | BackupJob | CleanupJob | ReminderJob;

// =============================================================================
// QUEUE SERVICE
// =============================================================================

class QueueService {
  private notificationQueue: Queue<NotificationJob> | null = null;
  private backupQueue: Queue<BackupJob> | null = null;
  private cleanupQueue: Queue<CleanupJob> | null = null;
  private reminderQueue: Queue<ReminderJob> | null = null;

  private notificationWorker: Worker<NotificationJob> | null = null;
  private backupWorker: Worker<BackupJob> | null = null;
  private cleanupWorker: Worker<CleanupJob> | null = null;
  private reminderWorker: Worker<ReminderJob> | null = null;

  private queueEvents: QueueEvents | null = null;
  private isInitialized = false;

  // ===========================================================================
  // INICIALIZAÇÃO
  // ===========================================================================

  async initialize(): Promise<void> {
    try {
      // Criar filas
      this.notificationQueue = new Queue<NotificationJob>('notifications', {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      });

      this.backupQueue = new Queue<BackupJob>('backups', {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: 2,
          removeOnComplete: 10,
          removeOnFail: 10,
        },
      });

      this.cleanupQueue = new Queue<CleanupJob>('cleanup', {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: 1,
          removeOnComplete: 5,
          removeOnFail: 5,
        },
      });

      this.reminderQueue = new Queue<ReminderJob>('reminders', {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      });

      // Criar workers
      await this.createWorkers();

      // Criar eventos
      this.queueEvents = new QueueEvents('notifications', {
        connection: redisConnection,
      });

      this.setupEventListeners();

      this.isInitialized = true;
      logger.info('[Queue] Serviço de filas inicializado');
    } catch (error) {
      logger.error('[Queue] Erro ao inicializar filas', error);
      // Não lançar erro - permitir que o bot funcione sem filas
    }
  }

  private async createWorkers(): Promise<void> {
    // Worker de notificações
    this.notificationWorker = new Worker<NotificationJob>(
      'notifications',
      async (job: Job<NotificationJob>) => {
        logger.debug(`[Queue] Processando notificação: ${job.id}`);

        const { type, booking } = job.data;

        if (type === 'telegram') {
          await notificationService.sendTelegramNotification(booking);
        }

        return { success: true, processedAt: new Date().toISOString() };
      },
      {
        connection: redisConnection,
        concurrency: 5,
        limiter: {
          max: 10,
          duration: 1000, // 10 jobs por segundo
        },
      }
    );

    // Worker de backup
    this.backupWorker = new Worker<BackupJob>(
      'backups',
      async (job: Job<BackupJob>) => {
        logger.debug(`[Queue] Processando backup: ${job.id}`);

        const result = await backupService.runBackup();

        return result;
      },
      {
        connection: redisConnection,
        concurrency: 1, // Apenas um backup por vez
      }
    );

    // Worker de limpeza
    this.cleanupWorker = new Worker<CleanupJob>(
      'cleanup',
      async (job: Job<CleanupJob>) => {
        logger.debug(`[Queue] Processando limpeza: ${job.id}`);

        const { type, olderThanDays } = job.data;

        if (type === 'bookings') {
          const cleaned = sqliteService.cleanOldBookings(olderThanDays);
          return { cleaned, type };
        }

        if (type === 'reminders') {
          const cleaned = await reminderService.cleanupOldReminders(olderThanDays);
          return { cleaned, type };
        }

        return { cleaned: 0, type };
      },
      {
        connection: redisConnection,
        concurrency: 1,
      }
    );

    // Worker de lembretes
    this.reminderWorker = new Worker<ReminderJob>(
      'reminders',
      async (job: Job<ReminderJob>) => {
        logger.debug(`[Queue] Processando lembrete: ${job.id}`);

        const { action } = job.data;

        if (action === 'process_pending') {
          // Buscar e processar todos os lembretes pendentes
          const pendingReminders = await reminderService.getPendingReminders();
          let sent = 0;
          let failed = 0;

          for (const reminder of pendingReminders) {
            try {
              // Gerar mensagem de lembrete
              const reminderMessage = reminderService.generateReminderMessage(
                reminder.type as 'reminder_24h' | 'reminder_2h',
                reminder.bookingName,
                reminder.bookingDate,
                reminder.bookingTime,
                reminder.bookingUnit
              );

              // Enviar via WhatsApp se tiver telefone
              if (reminder.phone) {
                // TODO: Integrar com whatsappService.sendMessage
                logger.info(`[Reminder] Enviando lembrete para ${reminder.phone}: ${reminder.type}`, {
                  message: reminderMessage.substring(0, 50),
                });
              }

              await reminderService.markAsSent(reminder.id);
              sent++;
            } catch (error) {
              await reminderService.markAsFailed(reminder.id, (error as Error).message);
              failed++;
            }
          }

          return { processed: pendingReminders.length, sent, failed };
        }

        return { processed: 0 };
      },
      {
        connection: redisConnection,
        concurrency: 1,
        limiter: {
          max: 5,
          duration: 1000, // 5 lembretes por segundo
        },
      }
    );
  }

  private setupEventListeners(): void {
    if (!this.notificationWorker) return;

    this.notificationWorker.on('completed', (job) => {
      logger.debug(`[Queue] Job concluído: ${job.id}`);
    });

    this.notificationWorker.on('failed', (job, err) => {
      logger.error(`[Queue] Job falhou: ${job?.id}`, err);
    });

    this.notificationWorker.on('error', (err) => {
      logger.error('[Queue] Erro no worker de notificações', err);
    });
  }

  // ===========================================================================
  // ADICIONAR JOBS
  // ===========================================================================

  async addNotification(booking: BookingDetails, type: 'telegram' | 'whatsapp' = 'telegram'): Promise<string | null> {
    if (!this.notificationQueue || !this.isInitialized) {
      logger.debug('[Queue] Filas não disponíveis, enviando notificação diretamente');
      return null;
    }

    try {
      const job = await this.notificationQueue.add(
        'send-notification',
        { type, booking },
        {
          priority: 1,
          delay: 0,
        }
      );

      logger.debug(`[Queue] Notificação adicionada à fila: ${job.id}`);
      return job.id ?? null;
    } catch (error) {
      logger.error('[Queue] Erro ao adicionar notificação à fila', error);
      return null;
    }
  }

  async scheduleBackup(type: 'daily' | 'manual' = 'manual'): Promise<string | null> {
    if (!this.backupQueue || !this.isInitialized) {
      return null;
    }

    try {
      const job = await this.backupQueue.add(
        'run-backup',
        {
          type,
          timestamp: new Date().toISOString(),
        }
      );

      logger.info(`[Queue] Backup agendado: ${job.id}`);
      return job.id ?? null;
    } catch (error) {
      logger.error('[Queue] Erro ao agendar backup', error);
      return null;
    }
  }

  async scheduleCleanup(type: 'sessions' | 'bookings' | 'logs' | 'reminders', olderThanDays: number = 30): Promise<string | null> {
    if (!this.cleanupQueue || !this.isInitialized) {
      return null;
    }

    try {
      const job = await this.cleanupQueue.add(
        'run-cleanup',
        { type, olderThanDays }
      );

      logger.info(`[Queue] Limpeza agendada: ${job.id}`);
      return job.id ?? null;
    } catch (error) {
      logger.error('[Queue] Erro ao agendar limpeza', error);
      return null;
    }
  }

  async scheduleReminderProcessing(): Promise<string | null> {
    if (!this.reminderQueue || !this.isInitialized) {
      return null;
    }

    try {
      const job = await this.reminderQueue.add(
        'process-reminders',
        { action: 'process_pending' }
      );

      logger.debug(`[Queue] Processamento de lembretes agendado: ${job.id}`);
      return job.id ?? null;
    } catch (error) {
      logger.error('[Queue] Erro ao agendar processamento de lembretes', error);
      return null;
    }
  }

  // ===========================================================================
  // JOBS REPETITIVOS (CRON)
  // ===========================================================================

  async setupRecurringJobs(): Promise<void> {
    if (!this.backupQueue || !this.cleanupQueue || !this.reminderQueue || !this.isInitialized) {
      return;
    }

    try {
      // Backup diário às 3h
      await this.backupQueue.add(
        'daily-backup',
        { type: 'daily', timestamp: '' },
        {
          repeat: {
            pattern: '0 3 * * *', // 3h da manhã
          },
          jobId: 'daily-backup-cron',
        }
      );

      // Limpeza semanal aos domingos às 4h
      await this.cleanupQueue.add(
        'weekly-cleanup',
        { type: 'bookings', olderThanDays: 30 },
        {
          repeat: {
            pattern: '0 4 * * 0', // Domingo 4h
          },
          jobId: 'weekly-cleanup-cron',
        }
      );

      // Processamento de lembretes a cada minuto
      await this.reminderQueue.add(
        'process-reminders',
        { action: 'process_pending' },
        {
          repeat: {
            pattern: '* * * * *', // A cada minuto
          },
          jobId: 'reminder-processing-cron',
        }
      );

      logger.info('[Queue] Jobs recorrentes configurados');
    } catch (error) {
      logger.error('[Queue] Erro ao configurar jobs recorrentes', error);
    }
  }

  // ===========================================================================
  // ESTATÍSTICAS
  // ===========================================================================

  async getStats(): Promise<{
    notifications: { waiting: number; active: number; completed: number; failed: number };
    backups: { waiting: number; active: number; completed: number; failed: number };
    cleanup: { waiting: number; active: number; completed: number; failed: number };
    reminders: { waiting: number; active: number; completed: number; failed: number };
  } | null> {
    if (!this.isInitialized) {
      return null;
    }

    try {
      const [notifCounts, backupCounts, cleanupCounts, reminderCounts] = await Promise.all([
        this.notificationQueue?.getJobCounts(),
        this.backupQueue?.getJobCounts(),
        this.cleanupQueue?.getJobCounts(),
        this.reminderQueue?.getJobCounts(),
      ]);

      return {
        notifications: {
          waiting: notifCounts?.waiting ?? 0,
          active: notifCounts?.active ?? 0,
          completed: notifCounts?.completed ?? 0,
          failed: notifCounts?.failed ?? 0,
        },
        backups: {
          waiting: backupCounts?.waiting ?? 0,
          active: backupCounts?.active ?? 0,
          completed: backupCounts?.completed ?? 0,
          failed: backupCounts?.failed ?? 0,
        },
        cleanup: {
          waiting: cleanupCounts?.waiting ?? 0,
          active: cleanupCounts?.active ?? 0,
          completed: cleanupCounts?.completed ?? 0,
          failed: cleanupCounts?.failed ?? 0,
        },
        reminders: {
          waiting: reminderCounts?.waiting ?? 0,
          active: reminderCounts?.active ?? 0,
          completed: reminderCounts?.completed ?? 0,
          failed: reminderCounts?.failed ?? 0,
        },
      };
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // ENCERRAMENTO
  // ===========================================================================

  async close(): Promise<void> {
    try {
      // Fechar workers
      await this.notificationWorker?.close();
      await this.backupWorker?.close();
      await this.cleanupWorker?.close();
      await this.reminderWorker?.close();

      // Fechar eventos
      await this.queueEvents?.close();

      // Fechar filas
      await this.notificationQueue?.close();
      await this.backupQueue?.close();
      await this.cleanupQueue?.close();
      await this.reminderQueue?.close();

      this.isInitialized = false;
      logger.info('[Queue] Serviço de filas encerrado');
    } catch (error) {
      logger.error('[Queue] Erro ao encerrar filas', error);
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

// Singleton
const queueService = new QueueService();
export default queueService;
