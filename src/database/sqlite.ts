import Database from 'better-sqlite3';
import path from 'path';
import CONFIG from '../config/index.js';
import logger from '../utils/logger.js';

// =============================================================================
// SQLITE DATABASE SERVICE
// =============================================================================
// Responsável por gerenciar agendamentos com persistência real em banco SQLite.
// Substitui o armazenamento em arquivos JSON para maior confiabilidade.
// =============================================================================

export interface BookingRecord {
  id?: number;
  unit: 'recreio' | 'bangu';
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  name: string;
  phone?: string;
  companion?: string;
  createdAt: string;
  updatedAt: string;
}

class SQLiteService {
  private db: Database.Database | null = null;
  private readonly dbPath: string;

  constructor() {
    this.dbPath = path.join(CONFIG.paths.data, 'bot.db');
  }

  // ===========================================================================
  // INICIALIZAÇÃO
  // ===========================================================================

  async initialize(): Promise<void> {
    try {
      this.db = new Database(this.dbPath);

      // Habilitar WAL mode para melhor performance e concorrência
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('foreign_keys = ON');

      // Executar migrations
      this.runMigrations();

      logger.info(`[SQLite] Banco inicializado: ${this.dbPath}`);
    } catch (error) {
      logger.error('[SQLite] Erro ao inicializar banco', error);
      throw error;
    }
  }

  // ===========================================================================
  // MIGRATIONS
  // ===========================================================================

  private runMigrations(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Criar tabela de migrations
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const migrations = this.getMigrations();
    const appliedMigrations = this.getAppliedMigrations();

    for (const migration of migrations) {
      if (!appliedMigrations.includes(migration.name)) {
        logger.info(`[SQLite] Aplicando migration: ${migration.name}`);

        const transaction = this.db.transaction(() => {
          migration.up(this.db!);
          this.db!.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
        });

        transaction();
        logger.info(`[SQLite] Migration aplicada: ${migration.name}`);
      }
    }
  }

  private getAppliedMigrations(): string[] {
    if (!this.db) return [];

    try {
      const rows = this.db.prepare('SELECT name FROM migrations ORDER BY id').all() as { name: string }[];
      return rows.map(r => r.name);
    } catch {
      return [];
    }
  }

  private getMigrations(): Array<{ name: string; up: (db: Database.Database) => void }> {
    return [
      {
        name: '001_create_bookings_table',
        up: (db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS bookings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              unit TEXT NOT NULL CHECK(unit IN ('recreio', 'bangu')),
              date TEXT NOT NULL,
              time TEXT NOT NULL,
              name TEXT NOT NULL,
              phone TEXT,
              companion TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now')),
              UNIQUE(unit, date, time, name)
            )
          `);

          // Índices para consultas frequentes
          db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_unit_date ON bookings(unit, date)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date)`);
        },
      },
      {
        name: '002_create_backup_log_table',
        up: (db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS backup_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              type TEXT NOT NULL,
              file_path TEXT NOT NULL,
              size_bytes INTEGER,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `);
        },
      },
      {
        name: '003_create_reminders_table',
        up: (db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS reminders (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              booking_id INTEGER NOT NULL,
              type TEXT NOT NULL CHECK(type IN ('reminder_24h', 'reminder_2h', 'confirmation')),
              status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed', 'confirmed')),
              scheduled_for TEXT NOT NULL,
              sent_at TEXT,
              phone TEXT,
              response TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
            )
          `);

          // Índices para consultas frequentes
          db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_for)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_phone ON reminders(phone)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_booking ON reminders(booking_id)`);
        },
      },
    ];
  }

  // ===========================================================================
  // OPERAÇÕES DE AGENDAMENTO
  // ===========================================================================

  /**
   * Adiciona um novo agendamento
   */
  addBooking(booking: Omit<BookingRecord, 'id' | 'createdAt' | 'updatedAt'>): BookingRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO bookings (unit, date, time, name, phone, companion, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        booking.unit,
        booking.date,
        booking.time,
        booking.name,
        booking.phone ?? null,
        booking.companion ?? null,
        now,
        now
      );

      return {
        id: result.lastInsertRowid as number,
        ...booking,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      // Duplicata - já existe agendamento
      if ((error as Error).message?.includes('UNIQUE constraint failed')) {
        logger.warn(`[SQLite] Agendamento duplicado: ${booking.name} em ${booking.date} ${booking.time}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Busca agendamentos por unidade e data
   */
  getBookingsByDate(unit: 'recreio' | 'bangu', date: string): BookingRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, unit, date, time, name, phone, companion,
             created_at as createdAt, updated_at as updatedAt
      FROM bookings
      WHERE unit = ? AND date = ?
      ORDER BY time, created_at
    `);

    return stmt.all(unit, date) as BookingRecord[];
  }

  /**
   * Busca agendamentos por horário específico
   */
  getBookingsByTime(unit: 'recreio' | 'bangu', date: string, time: string): BookingRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, unit, date, time, name, phone, companion,
             created_at as createdAt, updated_at as updatedAt
      FROM bookings
      WHERE unit = ? AND date = ? AND time = ?
      ORDER BY created_at
    `);

    return stmt.all(unit, date, time) as BookingRecord[];
  }

  /**
   * Conta agendamentos por horário
   */
  countBookingsByTime(unit: 'recreio' | 'bangu', date: string, time: string): number {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM bookings
      WHERE unit = ? AND date = ? AND time = ?
    `);

    const result = stmt.get(unit, date, time) as { count: number };
    return result.count;
  }

  /**
   * Remove agendamento
   */
  removeBooking(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM bookings WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Remove agendamentos antigos (limpeza)
   */
  cleanOldBookings(daysToKeep: number = 30): number {
    if (!this.db) throw new Error('Database not initialized');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const stmt = this.db.prepare('DELETE FROM bookings WHERE date < ?');
    const result = stmt.run(cutoffStr);

    if (result.changes > 0) {
      logger.info(`[SQLite] Removidos ${result.changes} agendamentos antigos (antes de ${cutoffStr})`);
    }

    return result.changes;
  }

  /**
   * Exporta todos os agendamentos de uma unidade (para backup)
   */
  exportBookings(unit: 'recreio' | 'bangu'): BookingRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, unit, date, time, name, phone, companion,
             created_at as createdAt, updated_at as updatedAt
      FROM bookings
      WHERE unit = ?
      ORDER BY date, time, created_at
    `);

    return stmt.all(unit) as BookingRecord[];
  }

  /**
   * Importa agendamentos do formato JSON antigo
   */
  importFromLegacyJSON(unit: 'recreio' | 'bangu', data: Record<string, Record<string, Array<{ name: string; phone?: string; createdAt?: string }>>>): number {
    if (!this.db) throw new Error('Database not initialized');

    let imported = 0;

    const transaction = this.db.transaction(() => {
      for (const [date, times] of Object.entries(data)) {
        for (const [time, entries] of Object.entries(times)) {
          for (const entry of entries) {
            try {
              this.addBooking({
                unit,
                date,
                time,
                name: entry.name,
                phone: entry.phone,
              });
              imported++;
            } catch {
              // Ignorar duplicatas
            }
          }
        }
      }
    });

    transaction();
    logger.info(`[SQLite] Importados ${imported} agendamentos de ${unit}`);
    return imported;
  }

  // ===========================================================================
  // BACKUP LOG
  // ===========================================================================

  logBackup(type: string, filePath: string, sizeBytes?: number): void {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO backup_log (type, file_path, size_bytes)
        VALUES (?, ?, ?)
      `);
      stmt.run(type, filePath, sizeBytes ?? null);
    } catch (error) {
      logger.error('[SQLite] Erro ao registrar backup', error);
    }
  }

  getLastBackup(type: string): { filePath: string; createdAt: string } | null {
    if (!this.db) return null;

    const stmt = this.db.prepare(`
      SELECT file_path as filePath, created_at as createdAt
      FROM backup_log
      WHERE type = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return stmt.get(type) as { filePath: string; createdAt: string } | null;
  }

  // ===========================================================================
  // OPERAÇÕES DE LEMBRETES
  // ===========================================================================

  /**
   * Adiciona um novo lembrete
   */
  addReminder(reminder: {
    bookingId: number;
    type: 'reminder_24h' | 'reminder_2h' | 'confirmation';
    status: 'pending' | 'sent' | 'failed' | 'confirmed';
    scheduledFor: string;
    phone?: string;
    createdAt: string;
  }): { id: number } & typeof reminder | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const stmt = this.db.prepare(`
        INSERT INTO reminders (booking_id, type, status, scheduled_for, phone, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        reminder.bookingId,
        reminder.type,
        reminder.status,
        reminder.scheduledFor,
        reminder.phone ?? null,
        reminder.createdAt
      );

      return {
        id: result.lastInsertRowid as number,
        ...reminder,
      };
    } catch (error) {
      logger.error('[SQLite] Erro ao criar lembrete', error);
      return null;
    }
  }

  /**
   * Busca lembretes pendentes que devem ser enviados
   */
  getPendingReminders(beforeDate: string): Array<{
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
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT
        r.id, r.booking_id as bookingId, r.type, r.status,
        r.scheduled_for as scheduledFor, r.phone,
        b.name as bookingName, b.date as bookingDate,
        b.time as bookingTime, b.unit as bookingUnit
      FROM reminders r
      JOIN bookings b ON r.booking_id = b.id
      WHERE r.status = 'pending' AND r.scheduled_for <= ?
      ORDER BY r.scheduled_for
    `);

    return stmt.all(beforeDate) as Array<{
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
    }>;
  }

  /**
   * Busca lembretes pendentes por telefone
   */
  getPendingRemindersByPhone(phone: string): Array<{
    id: number;
    bookingId: number;
    type: string;
    status: string;
    scheduledFor: string;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, booking_id as bookingId, type, status, scheduled_for as scheduledFor
      FROM reminders
      WHERE phone = ? AND status IN ('pending', 'sent')
      ORDER BY scheduled_for DESC
    `);

    return stmt.all(phone) as Array<{
      id: number;
      bookingId: number;
      type: string;
      status: string;
      scheduledFor: string;
    }>;
  }

  /**
   * Atualiza status do lembrete
   */
  updateReminderStatus(
    id: number,
    status: 'pending' | 'sent' | 'failed' | 'confirmed',
    sentAt?: string,
    response?: string
  ): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const stmt = this.db.prepare(`
        UPDATE reminders
        SET status = ?, sent_at = ?, response = ?
        WHERE id = ?
      `);

      const result = stmt.run(status, sentAt ?? null, response ?? null, id);
      return result.changes > 0;
    } catch (error) {
      logger.error(`[SQLite] Erro ao atualizar lembrete #${id}`, error);
      return false;
    }
  }

  /**
   * Retorna estatísticas de lembretes
   */
  getReminderStats(): { pending: number; sent: number; confirmed: number; failed: number } {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM reminders
    `);

    const result = stmt.get() as { pending: number; sent: number; confirmed: number; failed: number } | undefined;
    return result ?? { pending: 0, sent: 0, confirmed: 0, failed: 0 };
  }

  /**
   * Remove lembretes antigos
   */
  cleanupOldReminders(beforeDate: string): number {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      DELETE FROM reminders
      WHERE created_at < ? AND status IN ('sent', 'failed', 'confirmed')
    `);

    const result = stmt.run(beforeDate);

    if (result.changes > 0) {
      logger.info(`[SQLite] Removidos ${result.changes} lembretes antigos`);
    }

    return result.changes;
  }

  /**
   * Busca lembretes por booking
   */
  getRemindersByBooking(bookingId: number): Array<{
    id: number;
    type: string;
    status: string;
    scheduledFor: string;
    sentAt: string | null;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, type, status, scheduled_for as scheduledFor, sent_at as sentAt
      FROM reminders
      WHERE booking_id = ?
      ORDER BY scheduled_for
    `);

    return stmt.all(bookingId) as Array<{
      id: number;
      type: string;
      status: string;
      scheduledFor: string;
      sentAt: string | null;
    }>;
  }

  // ===========================================================================
  // ENCERRAMENTO
  // ===========================================================================

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('[SQLite] Banco fechado');
    }
  }

  isReady(): boolean {
    return this.db !== null;
  }
}

// Singleton
const sqliteService = new SQLiteService();
export default sqliteService;
