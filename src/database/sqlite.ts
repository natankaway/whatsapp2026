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

export interface PollTemplateRecord {
  id?: number;
  name: string;
  options: string[];
  targetGroup: 'recreio' | 'bangu' | 'custom';
  customGroupId?: string;
  scheduleType: 'manual' | 'scheduled';
  scheduleCron?: string;
  scheduleDescription?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PollTemplateRecordRaw {
  id: number;
  name: string;
  options: string;
  targetGroup: string;
  customGroupId: string | null;
  scheduleType: string;
  scheduleCron: string | null;
  scheduleDescription: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface PollNameRecord {
  id?: number;
  dayOfWeek: string;
  names: string[];
  isActive: boolean;
}

interface PollNameRecordRaw {
  id: number;
  dayOfWeek: string;
  names: string;
  isActive: number;
}

export interface SettingsRecord {
  key: string;
  value: string;
  updatedAt: string;
}

export interface BotSettings {
  botPaused: boolean;
  pauseReason?: string;
  pausedAt?: string;
  pausedBy?: string;
  workingHoursEnabled: boolean;
  workingHoursStart: string; // HH:MM
  workingHoursEnd: string; // HH:MM
  workingDays: number[]; // 0-6 (domingo-sábado)
  outsideHoursMessage: string;
  pausedMessage: string;
}

export interface UnitRecord {
  id?: number;
  slug: string;
  name: string;
  address: string;
  location: string;
  whatsappGroupId?: string;
  workingDays: string;
  schedules: string[];
  schedulesText?: string;
  saturdayClass?: string;
  prices: {
    mensalidade?: Array<{ frequencia: string; valor: string }>;
    avulsa?: string;
  };
  platforms: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UnitRecordRaw {
  id: number;
  slug: string;
  name: string;
  address: string;
  location: string;
  whatsappGroupId: string | null;
  workingDays: string;
  schedules: string;
  schedulesText: string | null;
  saturdayClass: string | null;
  prices: string;
  platforms: string;
  isActive: number;
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
      {
        name: '004_create_units_table',
        up: (db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS units (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              slug TEXT NOT NULL UNIQUE,
              name TEXT NOT NULL,
              address TEXT NOT NULL,
              location TEXT NOT NULL,
              whatsapp_group_id TEXT,
              working_days TEXT NOT NULL DEFAULT 'Segunda a Sexta',
              schedules TEXT NOT NULL DEFAULT '[]',
              schedules_text TEXT,
              saturday_class TEXT,
              prices TEXT NOT NULL DEFAULT '{}',
              platforms TEXT NOT NULL DEFAULT '[]',
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `);

          db.exec(`CREATE INDEX IF NOT EXISTS idx_units_slug ON units(slug)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_units_active ON units(is_active)`);
        },
      },
      {
        name: '005_create_poll_templates_table',
        up: (db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS poll_templates (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              options TEXT NOT NULL DEFAULT '[]',
              target_group TEXT NOT NULL CHECK(target_group IN ('recreio', 'bangu', 'custom')),
              custom_group_id TEXT,
              schedule_type TEXT NOT NULL DEFAULT 'manual' CHECK(schedule_type IN ('manual', 'scheduled')),
              schedule_cron TEXT,
              schedule_description TEXT,
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `);

          db.exec(`CREATE INDEX IF NOT EXISTS idx_poll_templates_active ON poll_templates(is_active)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_poll_templates_target ON poll_templates(target_group)`);
        },
      },
      {
        name: '006_create_poll_names_table',
        up: (db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS poll_names (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              day_of_week TEXT NOT NULL UNIQUE,
              names TEXT NOT NULL DEFAULT '[]',
              is_active INTEGER NOT NULL DEFAULT 1
            )
          `);

          // Seed default poll names from CONFIG
          const defaultNames = [
            { day: 'segunda', names: ['Segunda de Treino ⚡', 'Segunda na Areia ⚡', 'Segunda de Futevôlei ⚡', 'SEGUNDOUUU ⚡'] },
            { day: 'terca', names: ['Terça de Treino ⚡', 'Terça na Quadra ⚡', 'Terça de Futevôlei ⚡', 'Terça na Areia ⚡', 'TERÇOUUU ⚡'] },
            { day: 'quarta', names: ['Quarta de Treino ⚡', 'Quarta na Areia ⚡', 'Quarta de Futevôlei ⚡', 'QUARTOUUU ⚡'] },
            { day: 'quinta', names: ['Quinta de Treino ⚡', 'Quinta na Quadra ⚡', 'Quinta de Futevôlei ⚡', 'Quinta na Areia ⚡', 'QUINTOUUU ⚡'] },
            { day: 'sexta', names: ['Sexta de Treino ⚡', 'Sexta na Areia ⚡', 'Sexta de Futevôlei ⚡', 'SEXTOUUU ⚡'] },
            { day: 'sabado', names: ['Aulão de Sábado 7H ⚡'] },
          ];

          const stmt = db.prepare('INSERT OR IGNORE INTO poll_names (day_of_week, names) VALUES (?, ?)');
          for (const item of defaultNames) {
            stmt.run(item.day, JSON.stringify(item.names));
          }
        },
      },
      {
        name: '007_create_settings_table',
        up: (db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `);

          // Seed default settings
          const defaultSettings = [
            { key: 'botPaused', value: 'false' },
            { key: 'pauseReason', value: '' },
            { key: 'pausedAt', value: '' },
            { key: 'pausedBy', value: '' },
            { key: 'workingHoursEnabled', value: 'false' },
            { key: 'workingHoursStart', value: '06:00' },
            { key: 'workingHoursEnd', value: '22:00' },
            { key: 'workingDays', value: '[1,2,3,4,5,6]' },
            { key: 'outsideHoursMessage', value: 'Estamos fora do horário de atendimento. Retornaremos em breve!' },
            { key: 'pausedMessage', value: 'O bot está temporariamente pausado. Por favor, aguarde.' },
          ];

          const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
          for (const setting of defaultSettings) {
            stmt.run(setting.key, setting.value);
          }
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
  // OPERAÇÕES DE UNIDADES
  // ===========================================================================

  /**
   * Interface para dados de unidade
   */
  getUnits(): UnitRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, slug, name, address, location, whatsapp_group_id as whatsappGroupId,
             working_days as workingDays, schedules, schedules_text as schedulesText,
             saturday_class as saturdayClass, prices, platforms, is_active as isActive,
             created_at as createdAt, updated_at as updatedAt
      FROM units
      WHERE is_active = 1
      ORDER BY id
    `);

    const rows = stmt.all() as UnitRecordRaw[];
    return rows.map(this.parseUnitRow);
  }

  getUnitById(id: number): UnitRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, slug, name, address, location, whatsapp_group_id as whatsappGroupId,
             working_days as workingDays, schedules, schedules_text as schedulesText,
             saturday_class as saturdayClass, prices, platforms, is_active as isActive,
             created_at as createdAt, updated_at as updatedAt
      FROM units
      WHERE id = ?
    `);

    const row = stmt.get(id) as UnitRecordRaw | undefined;
    return row ? this.parseUnitRow(row) : null;
  }

  getUnitBySlug(slug: string): UnitRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, slug, name, address, location, whatsapp_group_id as whatsappGroupId,
             working_days as workingDays, schedules, schedules_text as schedulesText,
             saturday_class as saturdayClass, prices, platforms, is_active as isActive,
             created_at as createdAt, updated_at as updatedAt
      FROM units
      WHERE slug = ?
    `);

    const row = stmt.get(slug) as UnitRecordRaw | undefined;
    return row ? this.parseUnitRow(row) : null;
  }

  createUnit(unit: Omit<UnitRecord, 'id' | 'createdAt' | 'updatedAt'>): UnitRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO units (slug, name, address, location, whatsapp_group_id, working_days,
                          schedules, schedules_text, saturday_class, prices, platforms,
                          is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        unit.slug,
        unit.name,
        unit.address,
        unit.location,
        unit.whatsappGroupId ?? null,
        unit.workingDays,
        JSON.stringify(unit.schedules),
        unit.schedulesText ?? null,
        unit.saturdayClass ?? null,
        JSON.stringify(unit.prices),
        JSON.stringify(unit.platforms),
        unit.isActive ? 1 : 0,
        now,
        now
      );

      return {
        id: result.lastInsertRowid as number,
        ...unit,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      logger.error('[SQLite] Erro ao criar unidade', error);
      return null;
    }
  }

  updateUnit(id: number, unit: Partial<Omit<UnitRecord, 'id' | 'createdAt' | 'updatedAt'>>): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const updates: string[] = [];
      const values: unknown[] = [];

      if (unit.name !== undefined) { updates.push('name = ?'); values.push(unit.name); }
      if (unit.address !== undefined) { updates.push('address = ?'); values.push(unit.address); }
      if (unit.location !== undefined) { updates.push('location = ?'); values.push(unit.location); }
      if (unit.whatsappGroupId !== undefined) { updates.push('whatsapp_group_id = ?'); values.push(unit.whatsappGroupId); }
      if (unit.workingDays !== undefined) { updates.push('working_days = ?'); values.push(unit.workingDays); }
      if (unit.schedules !== undefined) { updates.push('schedules = ?'); values.push(JSON.stringify(unit.schedules)); }
      if (unit.schedulesText !== undefined) { updates.push('schedules_text = ?'); values.push(unit.schedulesText); }
      if (unit.saturdayClass !== undefined) { updates.push('saturday_class = ?'); values.push(unit.saturdayClass); }
      if (unit.prices !== undefined) { updates.push('prices = ?'); values.push(JSON.stringify(unit.prices)); }
      if (unit.platforms !== undefined) { updates.push('platforms = ?'); values.push(JSON.stringify(unit.platforms)); }
      if (unit.isActive !== undefined) { updates.push('is_active = ?'); values.push(unit.isActive ? 1 : 0); }

      if (updates.length === 0) return false;

      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      const stmt = this.db.prepare(`UPDATE units SET ${updates.join(', ')} WHERE id = ?`);
      const result = stmt.run(...values);

      return result.changes > 0;
    } catch (error) {
      logger.error(`[SQLite] Erro ao atualizar unidade #${id}`, error);
      return false;
    }
  }

  deleteUnit(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    // Soft delete - apenas desativa
    const stmt = this.db.prepare('UPDATE units SET is_active = 0, updated_at = ? WHERE id = ?');
    const result = stmt.run(new Date().toISOString(), id);
    return result.changes > 0;
  }

  private parseUnitRow(row: UnitRecordRaw): UnitRecord {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      address: row.address,
      location: row.location,
      whatsappGroupId: row.whatsappGroupId ?? undefined,
      workingDays: row.workingDays,
      schedules: JSON.parse(row.schedules || '[]'),
      schedulesText: row.schedulesText ?? undefined,
      saturdayClass: row.saturdayClass ?? undefined,
      prices: JSON.parse(row.prices || '{}'),
      platforms: JSON.parse(row.platforms || '[]'),
      isActive: row.isActive === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Inicializa unidades padrão se não existirem
   */
  seedDefaultUnits(defaultUnits: Array<Omit<UnitRecord, 'id' | 'createdAt' | 'updatedAt'>>): void {
    if (!this.db) return;

    for (const unit of defaultUnits) {
      const existing = this.getUnitBySlug(unit.slug);
      if (!existing) {
        this.createUnit(unit);
        logger.info(`[SQLite] Unidade criada: ${unit.name}`);
      }
    }
  }

  // ===========================================================================
  // OPERAÇÕES DE TEMPLATES DE ENQUETES
  // ===========================================================================

  getPollTemplates(): PollTemplateRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, name, options, target_group as targetGroup, custom_group_id as customGroupId,
             schedule_type as scheduleType, schedule_cron as scheduleCron,
             schedule_description as scheduleDescription, is_active as isActive,
             created_at as createdAt, updated_at as updatedAt
      FROM poll_templates
      WHERE is_active = 1
      ORDER BY id
    `);

    const rows = stmt.all() as PollTemplateRecordRaw[];
    return rows.map(this.parsePollTemplateRow);
  }

  getPollTemplateById(id: number): PollTemplateRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, name, options, target_group as targetGroup, custom_group_id as customGroupId,
             schedule_type as scheduleType, schedule_cron as scheduleCron,
             schedule_description as scheduleDescription, is_active as isActive,
             created_at as createdAt, updated_at as updatedAt
      FROM poll_templates
      WHERE id = ?
    `);

    const row = stmt.get(id) as PollTemplateRecordRaw | undefined;
    return row ? this.parsePollTemplateRow(row) : null;
  }

  createPollTemplate(poll: Omit<PollTemplateRecord, 'id' | 'createdAt' | 'updatedAt'>): PollTemplateRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO poll_templates (name, options, target_group, custom_group_id,
                                   schedule_type, schedule_cron, schedule_description,
                                   is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        poll.name,
        JSON.stringify(poll.options),
        poll.targetGroup,
        poll.customGroupId ?? null,
        poll.scheduleType,
        poll.scheduleCron ?? null,
        poll.scheduleDescription ?? null,
        poll.isActive ? 1 : 0,
        now,
        now
      );

      return {
        id: result.lastInsertRowid as number,
        ...poll,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      logger.error('[SQLite] Erro ao criar template de enquete', error);
      return null;
    }
  }

  updatePollTemplate(id: number, poll: Partial<Omit<PollTemplateRecord, 'id' | 'createdAt' | 'updatedAt'>>): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const updates: string[] = [];
      const values: unknown[] = [];

      if (poll.name !== undefined) { updates.push('name = ?'); values.push(poll.name); }
      if (poll.options !== undefined) { updates.push('options = ?'); values.push(JSON.stringify(poll.options)); }
      if (poll.targetGroup !== undefined) { updates.push('target_group = ?'); values.push(poll.targetGroup); }
      if (poll.customGroupId !== undefined) { updates.push('custom_group_id = ?'); values.push(poll.customGroupId); }
      if (poll.scheduleType !== undefined) { updates.push('schedule_type = ?'); values.push(poll.scheduleType); }
      if (poll.scheduleCron !== undefined) { updates.push('schedule_cron = ?'); values.push(poll.scheduleCron); }
      if (poll.scheduleDescription !== undefined) { updates.push('schedule_description = ?'); values.push(poll.scheduleDescription); }
      if (poll.isActive !== undefined) { updates.push('is_active = ?'); values.push(poll.isActive ? 1 : 0); }

      if (updates.length === 0) return false;

      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      const stmt = this.db.prepare(`UPDATE poll_templates SET ${updates.join(', ')} WHERE id = ?`);
      const result = stmt.run(...values);

      return result.changes > 0;
    } catch (error) {
      logger.error(`[SQLite] Erro ao atualizar template de enquete #${id}`, error);
      return false;
    }
  }

  deletePollTemplate(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('UPDATE poll_templates SET is_active = 0, updated_at = ? WHERE id = ?');
    const result = stmt.run(new Date().toISOString(), id);
    return result.changes > 0;
  }

  private parsePollTemplateRow(row: PollTemplateRecordRaw): PollTemplateRecord {
    return {
      id: row.id,
      name: row.name,
      options: JSON.parse(row.options || '[]'),
      targetGroup: row.targetGroup as 'recreio' | 'bangu' | 'custom',
      customGroupId: row.customGroupId ?? undefined,
      scheduleType: row.scheduleType as 'manual' | 'scheduled',
      scheduleCron: row.scheduleCron ?? undefined,
      scheduleDescription: row.scheduleDescription ?? undefined,
      isActive: row.isActive === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ===========================================================================
  // OPERAÇÕES DE NOMES DE ENQUETES
  // ===========================================================================

  getPollNames(): PollNameRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, day_of_week as dayOfWeek, names, is_active as isActive
      FROM poll_names
      WHERE is_active = 1
      ORDER BY id
    `);

    const rows = stmt.all() as PollNameRecordRaw[];
    return rows.map(this.parsePollNameRow);
  }

  getPollNamesByDay(dayOfWeek: string): PollNameRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, day_of_week as dayOfWeek, names, is_active as isActive
      FROM poll_names
      WHERE day_of_week = ? AND is_active = 1
    `);

    const row = stmt.get(dayOfWeek) as PollNameRecordRaw | undefined;
    return row ? this.parsePollNameRow(row) : null;
  }

  updatePollNames(dayOfWeek: string, names: string[]): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const stmt = this.db.prepare(`
        INSERT INTO poll_names (day_of_week, names) VALUES (?, ?)
        ON CONFLICT(day_of_week) DO UPDATE SET names = excluded.names
      `);

      stmt.run(dayOfWeek, JSON.stringify(names));
      return true;
    } catch (error) {
      logger.error(`[SQLite] Erro ao atualizar nomes de enquete para ${dayOfWeek}`, error);
      return false;
    }
  }

  private parsePollNameRow(row: PollNameRecordRaw): PollNameRecord {
    return {
      id: row.id,
      dayOfWeek: row.dayOfWeek,
      names: JSON.parse(row.names || '[]'),
      isActive: row.isActive === 1,
    };
  }

  // ===========================================================================
  // OPERAÇÕES DE CONFIGURAÇÕES
  // ===========================================================================

  getSetting(key: string): string | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const stmt = this.db.prepare(`
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `);
      stmt.run(key, value);
      return true;
    } catch (error) {
      logger.error(`[SQLite] Erro ao salvar configuração ${key}`, error);
      return false;
    }
  }

  getAllSettings(): Record<string, string> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT key, value FROM settings');
    const rows = stmt.all() as Array<{ key: string; value: string }>;

    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  getBotSettings(): BotSettings {
    const settings = this.getAllSettings();

    return {
      botPaused: settings.botPaused === 'true',
      pauseReason: settings.pauseReason || undefined,
      pausedAt: settings.pausedAt || undefined,
      pausedBy: settings.pausedBy || undefined,
      workingHoursEnabled: settings.workingHoursEnabled === 'true',
      workingHoursStart: settings.workingHoursStart || '06:00',
      workingHoursEnd: settings.workingHoursEnd || '22:00',
      workingDays: JSON.parse(settings.workingDays || '[1,2,3,4,5,6]'),
      outsideHoursMessage: settings.outsideHoursMessage || 'Estamos fora do horário de atendimento.',
      pausedMessage: settings.pausedMessage || 'O bot está temporariamente pausado.',
    };
  }

  updateBotSettings(updates: Partial<BotSettings>): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const transaction = this.db.transaction(() => {
        if (updates.botPaused !== undefined) {
          this.setSetting('botPaused', String(updates.botPaused));
        }
        if (updates.pauseReason !== undefined) {
          this.setSetting('pauseReason', updates.pauseReason);
        }
        if (updates.pausedAt !== undefined) {
          this.setSetting('pausedAt', updates.pausedAt);
        }
        if (updates.pausedBy !== undefined) {
          this.setSetting('pausedBy', updates.pausedBy);
        }
        if (updates.workingHoursEnabled !== undefined) {
          this.setSetting('workingHoursEnabled', String(updates.workingHoursEnabled));
        }
        if (updates.workingHoursStart !== undefined) {
          this.setSetting('workingHoursStart', updates.workingHoursStart);
        }
        if (updates.workingHoursEnd !== undefined) {
          this.setSetting('workingHoursEnd', updates.workingHoursEnd);
        }
        if (updates.workingDays !== undefined) {
          this.setSetting('workingDays', JSON.stringify(updates.workingDays));
        }
        if (updates.outsideHoursMessage !== undefined) {
          this.setSetting('outsideHoursMessage', updates.outsideHoursMessage);
        }
        if (updates.pausedMessage !== undefined) {
          this.setSetting('pausedMessage', updates.pausedMessage);
        }
      });

      transaction();
      logger.info('[SQLite] Configurações do bot atualizadas');
      return true;
    } catch (error) {
      logger.error('[SQLite] Erro ao atualizar configurações do bot', error);
      return false;
    }
  }

  /**
   * Verifica se o bot deve responder com base nas configurações
   */
  shouldBotRespond(): { respond: boolean; message?: string } {
    const settings = this.getBotSettings();

    // Verificar se bot está pausado globalmente
    if (settings.botPaused) {
      return { respond: false, message: settings.pausedMessage };
    }

    // Verificar horário de funcionamento
    if (settings.workingHoursEnabled) {
      const now = new Date();
      const currentDay = now.getDay();
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM

      // Verificar dia da semana
      if (!settings.workingDays.includes(currentDay)) {
        return { respond: false, message: settings.outsideHoursMessage };
      }

      // Verificar horário
      if (currentTime < settings.workingHoursStart || currentTime > settings.workingHoursEnd) {
        return { respond: false, message: settings.outsideHoursMessage };
      }
    }

    return { respond: true };
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
