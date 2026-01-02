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
  status?: 'confirmed' | 'pending' | 'cancelled';
  source?: 'whatsapp' | 'dashboard' | 'telegram';
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

export interface PollScheduleRecord {
  id?: number;
  name: string;
  description?: string;
  pollTitle?: string; // título customizado da enquete (se vazio, usa nome automático)
  targetGroup: 'recreio' | 'bangu' | 'custom';
  customGroupId?: string;
  dayOfWeek: string; // dia da semana para nome da enquete (segunda, terca, etc)
  pollOptions: string[]; // opções da enquete
  scheduleHour: number; // 0-23
  scheduleMinute: number; // 0-59
  scheduleDays: number[]; // dias da semana que executa (0=dom, 1=seg, ..., 6=sab)
  isActive: boolean;
  lastExecutedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface PollScheduleRecordRaw {
  id: number;
  name: string;
  description: string | null;
  pollTitle: string | null;
  targetGroup: string;
  customGroupId: string | null;
  dayOfWeek: string;
  pollOptions: string;
  scheduleHour: number;
  scheduleMinute: number;
  scheduleDays: string;
  isActive: number;
  lastExecutedAt: string | null;
  createdAt: string;
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

// =============================================================================
// INTERFACES PARA ENQUETES ENVIADAS
// =============================================================================

export interface SentPollRecord {
  id?: number;
  scheduleId?: number;
  templateId?: number;
  groupId: string;
  messageId: string;
  messageKey: string; // JSON stringified WAMessageKey
  title: string;
  options: string[];
  sentAt: string;
  pinnedUntil?: string;
  createdAt: string;
}

interface SentPollRecordRaw {
  id: number;
  schedule_id: number | null;
  template_id: number | null;
  group_id: string;
  message_id: string;
  message_key: string;
  title: string;
  options: string;
  sent_at: string;
  pinned_until: string | null;
  created_at: string;
}

// =============================================================================
// INTERFACES PARA CONTROLE DE MENSALIDADES
// =============================================================================

export interface StudentRecord {
  id?: number;
  name: string;
  phone: string;
  email?: string;
  unit: 'recreio' | 'bangu';
  plan: string; // ex: "1x", "2x", "3x", "5x", "plataforma"
  planValue: number; // valor em centavos
  dueDay: number; // dia do vencimento (1-31)
  startDate: string; // data de inicio
  status: 'active' | 'inactive' | 'suspended';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface StudentRecordRaw {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  unit: string;
  plan: string;
  planValue: number;
  dueDay: number;
  startDate: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id?: number;
  studentId: number;
  amount: number; // valor em centavos
  referenceMonth: string; // YYYY-MM
  paymentDate: string; // YYYY-MM-DD
  paymentMethod: 'pix' | 'dinheiro' | 'cartao' | 'transferencia' | 'outro';
  notes?: string;
  createdAt: string;
}

interface PaymentRecordRaw {
  id: number;
  studentId: number;
  amount: number;
  referenceMonth: string;
  paymentDate: string;
  paymentMethod: string;
  notes: string | null;
  createdAt: string;
  // Campos do JOIN com students
  studentName?: string;
  studentPhone?: string;
  studentUnit?: string;
}

export interface StudentWithPayments extends StudentRecord {
  lastPayment?: PaymentRecord;
  isOverdue?: boolean;
  daysOverdue?: number;
}

// =============================================================================
// INTERFACES PARA CONTROLE DE CHECK-INS (PLATAFORMAS)
// =============================================================================

export interface CheckinStudentRecord {
  id?: number;
  name: string;
  phone: string;
  unit: 'recreio' | 'bangu';
  platform: 'wellhub' | 'totalpass' | 'gurupass';
  balance: number; // saldo de check-ins (positivo = tem créditos, negativo = deve)
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface CheckinStudentRecordRaw {
  id: number;
  name: string;
  phone: string;
  unit: string;
  platform: string;
  balance: number;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CheckinTransactionRecord {
  id?: number;
  studentId: number;
  type: 'credit' | 'debit'; // credit = fez check-in no app, debit = usou na aula
  amount: number; // quantidade de check-ins
  date: string; // YYYY-MM-DD
  notes?: string;
  createdAt: string;
  // campos do JOIN
  studentName?: string;
  studentPhone?: string;
}

interface CheckinTransactionRecordRaw {
  id: number;
  studentId: number;
  type: string;
  amount: number;
  date: string;
  notes: string | null;
  createdAt: string;
  studentName?: string;
  studentPhone?: string;
}

export interface CheckinStudentWithBalance extends CheckinStudentRecord {
  lastTransaction?: CheckinTransactionRecord;
}

// =============================================================================
// INTERFACES PARA ALUNOS UNIFICADOS
// =============================================================================

export interface UnifiedStudentRecord {
  id?: number;
  name: string;
  phone: string;
  email?: string;
  birthDate?: string; // YYYY-MM-DD
  unit: 'recreio' | 'bangu';
  paymentType: 'mensalidade' | 'plataforma';
  // Campos para mensalidade
  plan?: string; // ex: "1x", "2x", "3x", "5x"
  planValue?: number; // valor em centavos
  dueDay?: number; // dia do vencimento (1-31)
  startDate?: string; // data de inicio
  // Campos para plataforma
  platform?: 'wellhub' | 'totalpass' | 'gurupass';
  balance?: number; // saldo de check-ins
  // Campos comuns
  status: 'active' | 'inactive' | 'suspended';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface UnifiedStudentRecordRaw {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  birthDate: string | null;
  unit: string;
  paymentType: string;
  plan: string | null;
  planValue: number | null;
  dueDay: number | null;
  startDate: string | null;
  platform: string | null;
  balance: number | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// INTERFACES PARA CONTROLE FINANCEIRO (CAIXA)
// =============================================================================

export interface CashTransactionRecord {
  id?: number;
  unit: string; // unidade: recreio, bangu, geral
  type: 'income' | 'expense'; // entrada ou saída
  category: string; // ex: mensalidade, aula_avulsa, equipamento, manutenção, etc
  description: string;
  amount: number; // valor em centavos
  paymentMethod: 'pix' | 'dinheiro' | 'cartao' | 'transferencia' | 'outro';
  date: string; // YYYY-MM-DD
  referenceId?: number; // ID de referência (ex: studentId, paymentId)
  referenceType?: string; // Tipo de referência (ex: 'student', 'payment')
  installmentId?: number; // ID do parcelamento (se for parcela)
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface CashTransactionRecordRaw {
  id: number;
  unit: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  date: string;
  reference_id: number | null;
  reference_type: string | null;
  installment_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstallmentRecord {
  id?: number;
  unit: string; // unidade: recreio, bangu, geral
  description: string;
  totalAmount: number; // valor total em centavos
  installmentCount: number; // número de parcelas
  paidCount: number; // número de parcelas pagas
  category: string;
  startDate: string; // data da primeira parcela
  status: 'active' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface InstallmentRecordRaw {
  id: number;
  unit: string;
  description: string;
  total_amount: number;
  installment_count: number;
  paid_count: number;
  category: string;
  start_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  byCategory: Record<string, { income: number; expense: number }>;
  byPaymentMethod: Record<string, number>;
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
  schedulesText?: string[];
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

export interface NotificationRecord {
  id: number;
  type: string;
  title: string;
  message: string;
  icon?: string;
  link?: string;
  referenceId?: number;
  referenceType?: string;
  read: boolean;
  createdAt: string;
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
      {
        name: '008_create_poll_schedules_table',
        up: (db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS poll_schedules (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              description TEXT,
              target_group TEXT NOT NULL CHECK(target_group IN ('recreio', 'bangu', 'custom')),
              custom_group_id TEXT,
              day_of_week TEXT NOT NULL,
              poll_options TEXT NOT NULL DEFAULT '[]',
              schedule_hour INTEGER NOT NULL CHECK(schedule_hour >= 0 AND schedule_hour <= 23),
              schedule_minute INTEGER NOT NULL DEFAULT 0 CHECK(schedule_minute >= 0 AND schedule_minute <= 59),
              schedule_days TEXT NOT NULL DEFAULT '[]',
              is_active INTEGER NOT NULL DEFAULT 1,
              last_executed_at TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `);

          db.exec(`CREATE INDEX IF NOT EXISTS idx_poll_schedules_active ON poll_schedules(is_active)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_poll_schedules_target ON poll_schedules(target_group)`);

          // Seed default poll schedules based on current hardcoded values
          const defaultSchedules = [
            // RECREIO - Segunda a Sexta às 8h
            {
              name: 'Recreio - Segunda a Sexta 8h',
              description: 'Enquete diária do Recreio para treinos',
              targetGroup: 'recreio',
              dayOfWeek: 'auto', // usa o dia atual
              pollOptions: JSON.stringify(['17:30 ⚡', '18:30 ⚡', '19:30 ⚡']),
              scheduleHour: 8,
              scheduleMinute: 0,
              scheduleDays: JSON.stringify([1, 2, 3, 4, 5]), // seg-sex
            },
            // RECREIO - Sexta 20h (para sábado)
            {
              name: 'Recreio - Sábado (sexta 20h)',
              description: 'Enquete de sábado enviada na sexta à noite',
              targetGroup: 'recreio',
              dayOfWeek: 'sabado',
              pollOptions: JSON.stringify(['Treino ⚡', 'Treino + Joguinho ⚡']),
              scheduleHour: 20,
              scheduleMinute: 0,
              scheduleDays: JSON.stringify([5]), // sexta
            },
            // BANGU - Domingo 21h (para segunda)
            {
              name: 'Bangu - Segunda (domingo 21h)',
              description: 'Enquete de segunda enviada no domingo à noite',
              targetGroup: 'bangu',
              dayOfWeek: 'segunda',
              pollOptions: JSON.stringify(['07h00 - LIVRE ⚡', '08h00 - LIVRE ⚡', '09h00 - INICIANTES ⚡', '17h00 - AVANÇADO ⚡', '18h00 - INTERMEDIÁRIO ⚡', '19h00 - INICIANTES ⚡', '20h00 - LIVRE ⚡']),
              scheduleHour: 21,
              scheduleMinute: 0,
              scheduleDays: JSON.stringify([0]), // domingo
            },
            // BANGU - Terça 13h (para terça - mesmo dia)
            {
              name: 'Bangu - Terça 13h',
              description: 'Enquete de terça (mesmo dia)',
              targetGroup: 'bangu',
              dayOfWeek: 'terca',
              pollOptions: JSON.stringify(['19h00 - INTERMEDIÁRIO ⚡', '20h00 - INICIANTES ⚡', '21h00 - AVANÇADO ⚡']),
              scheduleHour: 13,
              scheduleMinute: 0,
              scheduleDays: JSON.stringify([2]), // terça
            },
            // BANGU - Terça 21h (para quarta)
            {
              name: 'Bangu - Quarta (terça 21h)',
              description: 'Enquete de quarta enviada na terça à noite',
              targetGroup: 'bangu',
              dayOfWeek: 'quarta',
              pollOptions: JSON.stringify(['07h00 - LIVRE ⚡', '08h00 - LIVRE ⚡', '09h00 - INICIANTES ⚡', '17h00 - AVANÇADO ⚡', '18h00 - INTERMEDIÁRIO ⚡', '19h00 - INICIANTES ⚡']),
              scheduleHour: 21,
              scheduleMinute: 0,
              scheduleDays: JSON.stringify([2]), // terça
            },
            // BANGU - Quinta 13h (para quinta - mesmo dia)
            {
              name: 'Bangu - Quinta 13h',
              description: 'Enquete de quinta (mesmo dia)',
              targetGroup: 'bangu',
              dayOfWeek: 'quinta',
              pollOptions: JSON.stringify(['19h00 - INTERMEDIÁRIO ⚡', '20h00 - INICIANTES ⚡', '21h00 - AVANÇADO ⚡']),
              scheduleHour: 13,
              scheduleMinute: 0,
              scheduleDays: JSON.stringify([4]), // quinta
            },
            // BANGU - Quinta 21h (para sexta)
            {
              name: 'Bangu - Sexta (quinta 21h)',
              description: 'Enquete de sexta enviada na quinta à noite',
              targetGroup: 'bangu',
              dayOfWeek: 'sexta',
              pollOptions: JSON.stringify(['07h00 - LIVRE ⚡', '08h00 - LIVRE ⚡', '09h00 - INICIANTES ⚡', '17h00 - AVANÇADO ⚡', '18h00 - INTERMEDIÁRIO ⚡', '19h00 - INICIANTES ⚡', '20h00 - LIVRE ⚡']),
              scheduleHour: 21,
              scheduleMinute: 0,
              scheduleDays: JSON.stringify([4]), // quinta
            },
          ];

          const stmt = db.prepare(`
            INSERT INTO poll_schedules (name, description, target_group, day_of_week, poll_options, schedule_hour, schedule_minute, schedule_days)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const schedule of defaultSchedules) {
            stmt.run(
              schedule.name,
              schedule.description,
              schedule.targetGroup,
              schedule.dayOfWeek,
              schedule.pollOptions,
              schedule.scheduleHour,
              schedule.scheduleMinute,
              schedule.scheduleDays
            );
          }
        },
      },
      {
        name: '009_create_students_payments_tables',
        up: (db) => {
          // Tabela de alunos
          db.exec(`
            CREATE TABLE IF NOT EXISTS students (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              phone TEXT NOT NULL,
              email TEXT,
              unit TEXT NOT NULL CHECK(unit IN ('recreio', 'bangu')),
              plan TEXT NOT NULL,
              plan_value INTEGER NOT NULL DEFAULT 0,
              due_day INTEGER NOT NULL CHECK(due_day >= 1 AND due_day <= 31),
              start_date TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended')),
              notes TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `);

          db.exec(`CREATE INDEX IF NOT EXISTS idx_students_unit ON students(unit)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_students_status ON students(status)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_students_phone ON students(phone)`);

          // Tabela de pagamentos
          db.exec(`
            CREATE TABLE IF NOT EXISTS payments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              student_id INTEGER NOT NULL,
              amount INTEGER NOT NULL,
              reference_month TEXT NOT NULL,
              payment_date TEXT NOT NULL,
              payment_method TEXT NOT NULL CHECK(payment_method IN ('pix', 'dinheiro', 'cartao', 'transferencia', 'outro')),
              notes TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
            )
          `);

          db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference_month)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date)`);
        },
      },
      {
        name: '010_create_checkin_tables',
        up: (db) => {
          // Tabela de alunos de check-in (plataformas)
          db.exec(`
            CREATE TABLE IF NOT EXISTS checkin_students (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              phone TEXT NOT NULL,
              unit TEXT NOT NULL CHECK(unit IN ('recreio', 'bangu')),
              platform TEXT NOT NULL CHECK(platform IN ('wellhub', 'totalpass', 'gurupass')),
              balance INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
              notes TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `);

          db.exec(`CREATE INDEX IF NOT EXISTS idx_checkin_students_unit ON checkin_students(unit)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_checkin_students_platform ON checkin_students(platform)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_checkin_students_status ON checkin_students(status)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_checkin_students_phone ON checkin_students(phone)`);

          // Tabela de transações de check-in
          db.exec(`
            CREATE TABLE IF NOT EXISTS checkin_transactions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              student_id INTEGER NOT NULL,
              type TEXT NOT NULL CHECK(type IN ('credit', 'debit')),
              amount INTEGER NOT NULL DEFAULT 1,
              date TEXT NOT NULL,
              notes TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (student_id) REFERENCES checkin_students(id) ON DELETE CASCADE
            )
          `);

          db.exec(`CREATE INDEX IF NOT EXISTS idx_checkin_transactions_student ON checkin_transactions(student_id)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_checkin_transactions_date ON checkin_transactions(date)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_checkin_transactions_type ON checkin_transactions(type)`);
        },
      },
      {
        name: '011_create_sent_polls_table',
        up: (db) => {
          // Tabela de enquetes enviadas (para poder fixar depois)
          db.exec(`
            CREATE TABLE IF NOT EXISTS sent_polls (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              schedule_id INTEGER,
              template_id INTEGER,
              group_id TEXT NOT NULL,
              message_id TEXT NOT NULL,
              message_key TEXT NOT NULL,
              title TEXT NOT NULL,
              options TEXT NOT NULL DEFAULT '[]',
              sent_at TEXT NOT NULL DEFAULT (datetime('now')),
              pinned_until TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (schedule_id) REFERENCES poll_schedules(id) ON DELETE SET NULL,
              FOREIGN KEY (template_id) REFERENCES poll_templates(id) ON DELETE SET NULL
            )
          `);

          db.exec(`CREATE INDEX IF NOT EXISTS idx_sent_polls_group ON sent_polls(group_id)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_sent_polls_message ON sent_polls(message_id)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_sent_polls_sent_at ON sent_polls(sent_at)`);
        },
      },
      {
        name: '012_create_cash_tables',
        up: (db) => {
          // Tabela de parcelamentos
          db.exec(`
            CREATE TABLE IF NOT EXISTS installments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              description TEXT NOT NULL,
              total_amount INTEGER NOT NULL,
              installment_count INTEGER NOT NULL,
              paid_count INTEGER NOT NULL DEFAULT 0,
              category TEXT NOT NULL,
              start_date TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'active',
              notes TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `);

          db.exec(`CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_installments_category ON installments(category)`);

          // Tabela de transações de caixa
          db.exec(`
            CREATE TABLE IF NOT EXISTS cash_transactions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
              category TEXT NOT NULL,
              description TEXT NOT NULL,
              amount INTEGER NOT NULL,
              payment_method TEXT NOT NULL,
              date TEXT NOT NULL,
              reference_id INTEGER,
              reference_type TEXT,
              installment_id INTEGER,
              notes TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (installment_id) REFERENCES installments(id) ON DELETE SET NULL
            )
          `);

          db.exec(`CREATE INDEX IF NOT EXISTS idx_cash_transactions_type ON cash_transactions(type)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_cash_transactions_category ON cash_transactions(category)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_cash_transactions_date ON cash_transactions(date)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_cash_transactions_installment ON cash_transactions(installment_id)`);
        },
      },
      {
        name: '013_add_unit_to_cash_tables',
        up: (db) => {
          // Adicionar campo unit às tabelas de caixa
          db.exec(`ALTER TABLE cash_transactions ADD COLUMN unit TEXT NOT NULL DEFAULT 'geral'`);
          db.exec(`ALTER TABLE installments ADD COLUMN unit TEXT NOT NULL DEFAULT 'geral'`);

          db.exec(`CREATE INDEX IF NOT EXISTS idx_cash_transactions_unit ON cash_transactions(unit)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_installments_unit ON installments(unit)`);
        },
      },
      {
        name: '014_create_notifications_table',
        up: (db) => {
          // Tabela de notificações do dashboard
          db.exec(`
            CREATE TABLE IF NOT EXISTS notifications (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              type TEXT NOT NULL,
              title TEXT NOT NULL,
              message TEXT NOT NULL,
              icon TEXT,
              link TEXT,
              reference_id INTEGER,
              reference_type TEXT,
              read INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `);

          db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)`);
        },
      },
      {
        name: '015_add_poll_title_to_poll_schedules',
        up: (db) => {
          // Adiciona campo poll_title para título customizado da enquete
          db.exec(`ALTER TABLE poll_schedules ADD COLUMN poll_title TEXT`);
        },
      },
      {
        name: '016_create_unified_students_table',
        up: (db) => {
          // Tabela unificada de alunos
          db.exec(`
            CREATE TABLE IF NOT EXISTS unified_students (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              phone TEXT NOT NULL,
              email TEXT,
              birth_date TEXT,
              unit TEXT NOT NULL CHECK(unit IN ('recreio', 'bangu')),
              payment_type TEXT NOT NULL CHECK(payment_type IN ('mensalidade', 'plataforma')),
              plan TEXT,
              plan_value INTEGER,
              due_day INTEGER,
              start_date TEXT,
              platform TEXT CHECK(platform IN ('wellhub', 'totalpass', 'gurupass')),
              balance INTEGER DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended')),
              notes TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `);

          db.exec(`CREATE INDEX IF NOT EXISTS idx_unified_students_unit ON unified_students(unit)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_unified_students_payment_type ON unified_students(payment_type)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_unified_students_status ON unified_students(status)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_unified_students_phone ON unified_students(phone)`);
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
   * Atualiza um agendamento
   */
  updateBooking(id: number, updates: Partial<BookingRecord>): BookingRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }
      if (updates.name !== undefined) {
        fields.push('name = ?');
        values.push(updates.name);
      }
      if (updates.phone !== undefined) {
        fields.push('phone = ?');
        values.push(updates.phone);
      }
      if (updates.date !== undefined) {
        fields.push('date = ?');
        values.push(updates.date);
      }
      if (updates.time !== undefined) {
        fields.push('time = ?');
        values.push(updates.time);
      }

      if (fields.length === 0) {
        return null;
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const stmt = this.db.prepare(`
        UPDATE bookings SET ${fields.join(', ')} WHERE id = ?
      `);
      stmt.run(...values);

      // Return updated booking
      const selectStmt = this.db.prepare(`
        SELECT id, unit, date, time, name, phone, status, source, created_at as createdAt, updated_at as updatedAt
        FROM bookings WHERE id = ?
      `);
      return selectStmt.get(id) as BookingRecord | null;
    } catch (error) {
      logger.error('[SQLite] Erro ao atualizar agendamento', error);
      return null;
    }
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
        unit.schedulesText ? JSON.stringify(unit.schedulesText) : null,
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
      if (unit.schedulesText !== undefined) { updates.push('schedules_text = ?'); values.push(JSON.stringify(unit.schedulesText)); }
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
    // Helper para parsear schedulesText que pode estar em formato antigo (string) ou novo (JSON array)
    const parseSchedulesText = (value: string | null): string[] | undefined => {
      if (!value) return undefined;
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [value];
      } catch {
        // Formato antigo: string com quebras de linha
        return value.split('\n').filter(Boolean);
      }
    };

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      address: row.address,
      location: row.location,
      whatsappGroupId: row.whatsappGroupId ?? undefined,
      workingDays: row.workingDays,
      schedules: JSON.parse(row.schedules || '[]'),
      schedulesText: parseSchedulesText(row.schedulesText),
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
  // OPERAÇÕES DE AGENDAMENTOS DE ENQUETES
  // ===========================================================================

  getPollSchedules(): PollScheduleRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, name, description, poll_title as pollTitle, target_group as targetGroup, custom_group_id as customGroupId,
             day_of_week as dayOfWeek, poll_options as pollOptions, schedule_hour as scheduleHour,
             schedule_minute as scheduleMinute, schedule_days as scheduleDays, is_active as isActive,
             last_executed_at as lastExecutedAt, created_at as createdAt, updated_at as updatedAt
      FROM poll_schedules
      ORDER BY schedule_hour, schedule_minute
    `);

    const rows = stmt.all() as PollScheduleRecordRaw[];
    return rows.map(this.parsePollScheduleRow);
  }

  getActivePollSchedules(): PollScheduleRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, name, description, poll_title as pollTitle, target_group as targetGroup, custom_group_id as customGroupId,
             day_of_week as dayOfWeek, poll_options as pollOptions, schedule_hour as scheduleHour,
             schedule_minute as scheduleMinute, schedule_days as scheduleDays, is_active as isActive,
             last_executed_at as lastExecutedAt, created_at as createdAt, updated_at as updatedAt
      FROM poll_schedules
      WHERE is_active = 1
      ORDER BY schedule_hour, schedule_minute
    `);

    const rows = stmt.all() as PollScheduleRecordRaw[];
    return rows.map(this.parsePollScheduleRow);
  }

  getPollScheduleById(id: number): PollScheduleRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, name, description, poll_title as pollTitle, target_group as targetGroup, custom_group_id as customGroupId,
             day_of_week as dayOfWeek, poll_options as pollOptions, schedule_hour as scheduleHour,
             schedule_minute as scheduleMinute, schedule_days as scheduleDays, is_active as isActive,
             last_executed_at as lastExecutedAt, created_at as createdAt, updated_at as updatedAt
      FROM poll_schedules
      WHERE id = ?
    `);

    const row = stmt.get(id) as PollScheduleRecordRaw | undefined;
    return row ? this.parsePollScheduleRow(row) : null;
  }

  createPollSchedule(schedule: Omit<PollScheduleRecord, 'id' | 'createdAt' | 'updatedAt' | 'lastExecutedAt'>): PollScheduleRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO poll_schedules (name, description, poll_title, target_group, custom_group_id, day_of_week,
                                   poll_options, schedule_hour, schedule_minute, schedule_days,
                                   is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        schedule.name,
        schedule.description ?? null,
        schedule.pollTitle ?? null,
        schedule.targetGroup,
        schedule.customGroupId ?? null,
        schedule.dayOfWeek,
        JSON.stringify(schedule.pollOptions),
        schedule.scheduleHour,
        schedule.scheduleMinute,
        JSON.stringify(schedule.scheduleDays),
        schedule.isActive ? 1 : 0,
        now,
        now
      );

      return {
        id: result.lastInsertRowid as number,
        ...schedule,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      logger.error('[SQLite] Erro ao criar agendamento de enquete', error);
      return null;
    }
  }

  updatePollSchedule(id: number, schedule: Partial<Omit<PollScheduleRecord, 'id' | 'createdAt' | 'updatedAt'>>): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const updates: string[] = [];
      const values: unknown[] = [];

      if (schedule.name !== undefined) { updates.push('name = ?'); values.push(schedule.name); }
      if (schedule.description !== undefined) { updates.push('description = ?'); values.push(schedule.description); }
      if (schedule.pollTitle !== undefined) { updates.push('poll_title = ?'); values.push(schedule.pollTitle); }
      if (schedule.targetGroup !== undefined) { updates.push('target_group = ?'); values.push(schedule.targetGroup); }
      if (schedule.customGroupId !== undefined) { updates.push('custom_group_id = ?'); values.push(schedule.customGroupId); }
      if (schedule.dayOfWeek !== undefined) { updates.push('day_of_week = ?'); values.push(schedule.dayOfWeek); }
      if (schedule.pollOptions !== undefined) { updates.push('poll_options = ?'); values.push(JSON.stringify(schedule.pollOptions)); }
      if (schedule.scheduleHour !== undefined) { updates.push('schedule_hour = ?'); values.push(schedule.scheduleHour); }
      if (schedule.scheduleMinute !== undefined) { updates.push('schedule_minute = ?'); values.push(schedule.scheduleMinute); }
      if (schedule.scheduleDays !== undefined) { updates.push('schedule_days = ?'); values.push(JSON.stringify(schedule.scheduleDays)); }
      if (schedule.isActive !== undefined) { updates.push('is_active = ?'); values.push(schedule.isActive ? 1 : 0); }
      if (schedule.lastExecutedAt !== undefined) { updates.push('last_executed_at = ?'); values.push(schedule.lastExecutedAt); }

      if (updates.length === 0) return false;

      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      const stmt = this.db.prepare(`UPDATE poll_schedules SET ${updates.join(', ')} WHERE id = ?`);
      const result = stmt.run(...values);

      return result.changes > 0;
    } catch (error) {
      logger.error(`[SQLite] Erro ao atualizar agendamento de enquete #${id}`, error);
      return false;
    }
  }

  deletePollSchedule(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM poll_schedules WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  togglePollSchedule(id: number, isActive: boolean): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('UPDATE poll_schedules SET is_active = ?, updated_at = ? WHERE id = ?');
    const result = stmt.run(isActive ? 1 : 0, new Date().toISOString(), id);
    return result.changes > 0;
  }

  updatePollScheduleLastExecuted(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('UPDATE poll_schedules SET last_executed_at = ? WHERE id = ?');
    const result = stmt.run(new Date().toISOString(), id);
    return result.changes > 0;
  }

  private parsePollScheduleRow(row: PollScheduleRecordRaw): PollScheduleRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      pollTitle: row.pollTitle ?? undefined,
      targetGroup: row.targetGroup as 'recreio' | 'bangu' | 'custom',
      customGroupId: row.customGroupId ?? undefined,
      dayOfWeek: row.dayOfWeek,
      pollOptions: JSON.parse(row.pollOptions || '[]'),
      scheduleHour: row.scheduleHour,
      scheduleMinute: row.scheduleMinute,
      scheduleDays: JSON.parse(row.scheduleDays || '[]'),
      isActive: row.isActive === 1,
      lastExecutedAt: row.lastExecutedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
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

  // ===========================================================================
  // OPERAÇÕES DE ALUNOS (STUDENTS)
  // ===========================================================================

  getStudents(filters?: { unit?: string; status?: string }): StudentRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT id, name, phone, email, unit, plan, plan_value as planValue, due_day as dueDay,
             start_date as startDate, status, notes, created_at as createdAt, updated_at as updatedAt
      FROM students
    `;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters?.unit) {
      conditions.push('unit = ?');
      values.push(filters.unit);
    }

    if (filters?.status) {
      conditions.push('status = ?');
      values.push(filters.status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY name';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...values) as StudentRecordRaw[];
    return rows.map(this.parseStudentRow);
  }

  getStudentById(id: number): StudentRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, name, phone, email, unit, plan, plan_value as planValue, due_day as dueDay,
             start_date as startDate, status, notes, created_at as createdAt, updated_at as updatedAt
      FROM students WHERE id = ?
    `);

    const row = stmt.get(id) as StudentRecordRaw | undefined;
    return row ? this.parseStudentRow(row) : null;
  }

  getStudentByPhone(phone: string): StudentRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    // Normalizar telefone (remover caracteres não numéricos)
    const normalizedPhone = phone.replace(/\D/g, '');

    const stmt = this.db.prepare(`
      SELECT id, name, phone, email, unit, plan, plan_value as planValue, due_day as dueDay,
             start_date as startDate, status, notes, created_at as createdAt, updated_at as updatedAt
      FROM students WHERE REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '+', '') LIKE ?
    `);

    const row = stmt.get(`%${normalizedPhone}%`) as StudentRecordRaw | undefined;
    return row ? this.parseStudentRow(row) : null;
  }

  createStudent(student: Omit<StudentRecord, 'id' | 'createdAt' | 'updatedAt'>): StudentRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO students (name, phone, email, unit, plan, plan_value, due_day, start_date, status, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        student.name,
        student.phone,
        student.email ?? null,
        student.unit,
        student.plan,
        student.planValue,
        student.dueDay,
        student.startDate,
        student.status,
        student.notes ?? null,
        now,
        now
      );

      return {
        id: result.lastInsertRowid as number,
        ...student,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      logger.error('[SQLite] Erro ao criar aluno', error);
      return null;
    }
  }

  updateStudent(id: number, student: Partial<Omit<StudentRecord, 'id' | 'createdAt' | 'updatedAt'>>): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const updates: string[] = [];
      const values: unknown[] = [];

      if (student.name !== undefined) { updates.push('name = ?'); values.push(student.name); }
      if (student.phone !== undefined) { updates.push('phone = ?'); values.push(student.phone); }
      if (student.email !== undefined) { updates.push('email = ?'); values.push(student.email); }
      if (student.unit !== undefined) { updates.push('unit = ?'); values.push(student.unit); }
      if (student.plan !== undefined) { updates.push('plan = ?'); values.push(student.plan); }
      if (student.planValue !== undefined) { updates.push('plan_value = ?'); values.push(student.planValue); }
      if (student.dueDay !== undefined) { updates.push('due_day = ?'); values.push(student.dueDay); }
      if (student.startDate !== undefined) { updates.push('start_date = ?'); values.push(student.startDate); }
      if (student.status !== undefined) { updates.push('status = ?'); values.push(student.status); }
      if (student.notes !== undefined) { updates.push('notes = ?'); values.push(student.notes); }

      if (updates.length === 0) return false;

      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      const stmt = this.db.prepare(`UPDATE students SET ${updates.join(', ')} WHERE id = ?`);
      const result = stmt.run(...values);

      return result.changes > 0;
    } catch (error) {
      logger.error(`[SQLite] Erro ao atualizar aluno #${id}`, error);
      return false;
    }
  }

  deleteStudent(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM students WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private parseStudentRow(row: StudentRecordRaw): StudentRecord {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email ?? undefined,
      unit: row.unit as 'recreio' | 'bangu',
      plan: row.plan,
      planValue: row.planValue,
      dueDay: row.dueDay,
      startDate: row.startDate,
      status: row.status as 'active' | 'inactive' | 'suspended',
      notes: row.notes ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ===========================================================================
  // OPERAÇÕES DE PAGAMENTOS (PAYMENTS)
  // ===========================================================================

  getPayments(filters?: { studentId?: number; referenceMonth?: string; startDate?: string; endDate?: string }): (PaymentRecord & { studentName?: string; studentPhone?: string; studentUnit?: string })[] {
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT p.id, p.student_id as studentId, p.amount, p.reference_month as referenceMonth,
             p.payment_date as paymentDate, p.payment_method as paymentMethod, p.notes,
             p.created_at as createdAt, s.name as studentName, s.phone as studentPhone, s.unit as studentUnit
      FROM payments p
      LEFT JOIN students s ON p.student_id = s.id
    `;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters?.studentId) {
      conditions.push('p.student_id = ?');
      values.push(filters.studentId);
    }

    if (filters?.referenceMonth) {
      conditions.push('p.reference_month = ?');
      values.push(filters.referenceMonth);
    }

    if (filters?.startDate) {
      conditions.push('p.payment_date >= ?');
      values.push(filters.startDate);
    }

    if (filters?.endDate) {
      conditions.push('p.payment_date <= ?');
      values.push(filters.endDate);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY p.payment_date DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...values) as PaymentRecordRaw[];
    return rows.map(this.parsePaymentRow);
  }

  getPaymentsByStudent(studentId: number): PaymentRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, student_id as studentId, amount, reference_month as referenceMonth,
             payment_date as paymentDate, payment_method as paymentMethod, notes, created_at as createdAt
      FROM payments WHERE student_id = ? ORDER BY payment_date DESC
    `);

    const rows = stmt.all(studentId) as PaymentRecordRaw[];
    return rows.map(this.parsePaymentRow);
  }

  getLastPaymentByStudent(studentId: number): PaymentRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, student_id as studentId, amount, reference_month as referenceMonth,
             payment_date as paymentDate, payment_method as paymentMethod, notes, created_at as createdAt
      FROM payments WHERE student_id = ? ORDER BY payment_date DESC LIMIT 1
    `);

    const row = stmt.get(studentId) as PaymentRecordRaw | undefined;
    return row ? this.parsePaymentRow(row) : null;
  }

  createPayment(payment: Omit<PaymentRecord, 'id' | 'createdAt'>): PaymentRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO payments (student_id, amount, reference_month, payment_date, payment_method, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        payment.studentId,
        payment.amount,
        payment.referenceMonth,
        payment.paymentDate,
        payment.paymentMethod,
        payment.notes ?? null,
        now
      );

      return {
        id: result.lastInsertRowid as number,
        ...payment,
        createdAt: now,
      };
    } catch (error) {
      logger.error('[SQLite] Erro ao registrar pagamento', error);
      return null;
    }
  }

  deletePayment(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM payments WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private parsePaymentRow(row: PaymentRecordRaw): PaymentRecord & { studentName?: string; studentPhone?: string; studentUnit?: string } {
    return {
      id: row.id,
      studentId: row.studentId,
      amount: row.amount,
      referenceMonth: row.referenceMonth,
      paymentDate: row.paymentDate,
      paymentMethod: row.paymentMethod as PaymentRecord['paymentMethod'],
      notes: row.notes ?? undefined,
      createdAt: row.createdAt,
      studentName: row.studentName,
      studentPhone: row.studentPhone,
      studentUnit: row.studentUnit,
    };
  }

  // ===========================================================================
  // OPERAÇÕES DE RELATÓRIOS DE MENSALIDADES
  // ===========================================================================

  getStudentsWithPaymentStatus(): StudentWithPayments[] {
    if (!this.db) throw new Error('Database not initialized');

    const students = this.getStudents({ status: 'active' });
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    return students.map(student => {
      const lastPayment = this.getLastPaymentByStudent(student.id!);

      // Calcular se está em atraso
      let isOverdue = false;
      let daysOverdue = 0;

      if (lastPayment) {
        // Se o último pagamento foi para um mês anterior ao atual
        if (lastPayment.referenceMonth < currentMonth) {
          isOverdue = true;
          // Calcular dias de atraso desde o vencimento do mês atual
          const dueDate = new Date(today.getFullYear(), today.getMonth(), student.dueDay);
          if (today > dueDate) {
            daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          }
        }
      } else {
        // Nunca pagou - verificar se já passou do vencimento
        const dueDate = new Date(today.getFullYear(), today.getMonth(), student.dueDay);
        if (today > dueDate) {
          isOverdue = true;
          daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      }

      return {
        ...student,
        lastPayment: lastPayment || undefined,
        isOverdue,
        daysOverdue,
      };
    });
  }

  getOverdueStudents(): StudentWithPayments[] {
    return this.getStudentsWithPaymentStatus().filter(s => s.isOverdue);
  }

  getStudentsDueToday(): StudentRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    const today = new Date();
    const dueDay = today.getDate();

    const stmt = this.db.prepare(`
      SELECT id, name, phone, email, unit, plan, plan_value as planValue, due_day as dueDay,
             start_date as startDate, status, notes, created_at as createdAt, updated_at as updatedAt
      FROM students WHERE status = 'active' AND due_day = ?
    `);

    const rows = stmt.all(dueDay) as StudentRecordRaw[];
    return rows.map(this.parseStudentRow);
  }

  getMonthlyReport(month: string): {
    totalStudents: number;
    totalPaid: number;
    totalPending: number;
    totalRevenue: number;
    payments: (PaymentRecord & { studentName?: string })[];
  } {
    if (!this.db) throw new Error('Database not initialized');

    const activeStudents = this.getStudents({ status: 'active' });
    const payments = this.getPayments({ referenceMonth: month });
    const paidStudentIds = new Set(payments.map(p => p.studentId));

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      totalStudents: activeStudents.length,
      totalPaid: paidStudentIds.size,
      totalPending: activeStudents.length - paidStudentIds.size,
      totalRevenue,
      payments,
    };
  }

// ===========================================================================
  // OPERAÇÕES DE ALUNOS DE CHECK-IN (CHECKIN_STUDENTS)
  // ===========================================================================

  getCheckinStudents(filters?: { unit?: string; platform?: string; status?: string }): CheckinStudentRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT id, name, phone, unit, platform, balance, status, notes,
             created_at as createdAt, updated_at as updatedAt
      FROM checkin_students
    `;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters?.unit) {
      conditions.push('unit = ?');
      values.push(filters.unit);
    }

    if (filters?.platform) {
      conditions.push('platform = ?');
      values.push(filters.platform);
    }

    if (filters?.status) {
      conditions.push('status = ?');
      values.push(filters.status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY name';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...values) as CheckinStudentRecordRaw[];
    return rows.map(this.parseCheckinStudentRow);
  }

  getCheckinStudentById(id: number): CheckinStudentRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, name, phone, unit, platform, balance, status, notes,
             created_at as createdAt, updated_at as updatedAt
      FROM checkin_students WHERE id = ?
    `);

    const row = stmt.get(id) as CheckinStudentRecordRaw | undefined;
    return row ? this.parseCheckinStudentRow(row) : null;
  }

  createCheckinStudent(student: Omit<CheckinStudentRecord, 'id' | 'createdAt' | 'updatedAt'>): CheckinStudentRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO checkin_students (name, phone, unit, platform, balance, status, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        student.name,
        student.phone,
        student.unit,
        student.platform,
        student.balance || 0,
        student.status || 'active',
        student.notes ?? null,
        now,
        now
      );

      return {
        id: result.lastInsertRowid as number,
        ...student,
        balance: student.balance || 0,
        status: student.status || 'active',
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      logger.error('[SQLite] Erro ao criar aluno de check-in', error);
      return null;
    }
  }

  updateCheckinStudent(id: number, student: Partial<Omit<CheckinStudentRecord, 'id' | 'createdAt' | 'updatedAt'>>): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const updates: string[] = [];
      const values: unknown[] = [];

      if (student.name !== undefined) { updates.push('name = ?'); values.push(student.name); }
      if (student.phone !== undefined) { updates.push('phone = ?'); values.push(student.phone); }
      if (student.unit !== undefined) { updates.push('unit = ?'); values.push(student.unit); }
      if (student.platform !== undefined) { updates.push('platform = ?'); values.push(student.platform); }
      if (student.balance !== undefined) { updates.push('balance = ?'); values.push(student.balance); }
      if (student.status !== undefined) { updates.push('status = ?'); values.push(student.status); }
      if (student.notes !== undefined) { updates.push('notes = ?'); values.push(student.notes); }

      if (updates.length === 0) return false;

      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      const stmt = this.db.prepare(`UPDATE checkin_students SET ${updates.join(', ')} WHERE id = ?`);
      const result = stmt.run(...values);

      return result.changes > 0;
    } catch (error) {
      logger.error(`[SQLite] Erro ao atualizar aluno de check-in #${id}`, error);
      return false;
    }
  }

  deleteCheckinStudent(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM checkin_students WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private parseCheckinStudentRow(row: CheckinStudentRecordRaw): CheckinStudentRecord {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      unit: row.unit as 'recreio' | 'bangu',
      platform: row.platform as 'wellhub' | 'totalpass' | 'gurupass',
      balance: row.balance,
      status: row.status as 'active' | 'inactive',
      notes: row.notes ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ===========================================================================
  // OPERAÇÕES DE TRANSAÇÕES DE CHECK-IN (CHECKIN_TRANSACTIONS)
  // ===========================================================================

  getCheckinTransactions(filters?: { studentId?: number; type?: string; startDate?: string; endDate?: string }): CheckinTransactionRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT t.id, t.student_id as studentId, t.type, t.amount, t.date, t.notes,
             t.created_at as createdAt, s.name as studentName, s.phone as studentPhone
      FROM checkin_transactions t
      LEFT JOIN checkin_students s ON t.student_id = s.id
    `;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters?.studentId) {
      conditions.push('t.student_id = ?');
      values.push(filters.studentId);
    }

    if (filters?.type) {
      conditions.push('t.type = ?');
      values.push(filters.type);
    }

    if (filters?.startDate) {
      conditions.push('t.date >= ?');
      values.push(filters.startDate);
    }

    if (filters?.endDate) {
      conditions.push('t.date <= ?');
      values.push(filters.endDate);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY t.date DESC, t.created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...values) as CheckinTransactionRecordRaw[];
    return rows.map(this.parseCheckinTransactionRow);
  }

  getCheckinTransactionsByStudent(studentId: number): CheckinTransactionRecord[] {
    return this.getCheckinTransactions({ studentId });
  }

  createCheckinTransaction(transaction: Omit<CheckinTransactionRecord, 'id' | 'createdAt' | 'studentName' | 'studentPhone'>): CheckinTransactionRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const now = new Date().toISOString();

      // Usar transaction para atualizar saldo atomicamente
      const insertStmt = this.db.prepare(`
        INSERT INTO checkin_transactions (student_id, type, amount, date, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const updateBalanceStmt = this.db.prepare(`
        UPDATE checkin_students
        SET balance = balance + ?, updated_at = ?
        WHERE id = ?
      `);

      const result = this.db.transaction(() => {
        const insertResult = insertStmt.run(
          transaction.studentId,
          transaction.type,
          transaction.amount || 1,
          transaction.date,
          transaction.notes ?? null,
          now
        );

        // Atualizar saldo: credit adiciona, debit subtrai
        const balanceChange = transaction.type === 'credit'
          ? (transaction.amount || 1)
          : -(transaction.amount || 1);

        updateBalanceStmt.run(balanceChange, now, transaction.studentId);

        return insertResult;
      })();

      return {
        id: result.lastInsertRowid as number,
        ...transaction,
        amount: transaction.amount || 1,
        createdAt: now,
      };
    } catch (error) {
      logger.error('[SQLite] Erro ao registrar transação de check-in', error);
      return null;
    }
  }

  deleteCheckinTransaction(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Primeiro buscar a transação para reverter o saldo
      const getStmt = this.db.prepare(`
        SELECT student_id as studentId, type, amount FROM checkin_transactions WHERE id = ?
      `);
      const transaction = getStmt.get(id) as { studentId: number; type: string; amount: number } | undefined;

      if (!transaction) return false;

      const deleteStmt = this.db.prepare('DELETE FROM checkin_transactions WHERE id = ?');
      const updateBalanceStmt = this.db.prepare(`
        UPDATE checkin_students
        SET balance = balance + ?, updated_at = ?
        WHERE id = ?
      `);

      this.db.transaction(() => {
        deleteStmt.run(id);

        // Reverter o saldo: se era credit, subtrai; se era debit, adiciona
        const balanceRevert = transaction.type === 'credit'
          ? -transaction.amount
          : transaction.amount;

        updateBalanceStmt.run(balanceRevert, new Date().toISOString(), transaction.studentId);
      })();

      return true;
    } catch (error) {
      logger.error(`[SQLite] Erro ao deletar transação de check-in #${id}`, error);
      return false;
    }
  }

  private parseCheckinTransactionRow(row: CheckinTransactionRecordRaw): CheckinTransactionRecord {
    return {
      id: row.id,
      studentId: row.studentId,
      type: row.type as 'credit' | 'debit',
      amount: row.amount,
      date: row.date,
      notes: row.notes ?? undefined,
      createdAt: row.createdAt,
      studentName: row.studentName,
      studentPhone: row.studentPhone,
    };
  }

  // ===========================================================================
  // RELATÓRIOS DE CHECK-INS
  // ===========================================================================

  getCheckinStudentsWithBalance(): CheckinStudentWithBalance[] {
    if (!this.db) throw new Error('Database not initialized');

    const students = this.getCheckinStudents({ status: 'active' });

    return students.map(student => {
      const transactions = this.getCheckinTransactionsByStudent(student.id!);
      const lastTransaction = transactions.length > 0 ? transactions[0] : undefined;

      return {
        ...student,
        lastTransaction,
      };
    });
  }

  getCheckinStudentsOwing(): CheckinStudentRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, name, phone, unit, platform, balance, status, notes,
             created_at as createdAt, updated_at as updatedAt
      FROM checkin_students
      WHERE status = 'active' AND balance < 0
      ORDER BY balance ASC
    `);

    const rows = stmt.all() as CheckinStudentRecordRaw[];
    return rows.map(this.parseCheckinStudentRow);
  }

  getCheckinStudentsWithCredits(): CheckinStudentRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, name, phone, unit, platform, balance, status, notes,
             created_at as createdAt, updated_at as updatedAt
      FROM checkin_students
      WHERE status = 'active' AND balance > 0
      ORDER BY balance DESC
    `);

    const rows = stmt.all() as CheckinStudentRecordRaw[];
    return rows.map(this.parseCheckinStudentRow);
  }

  getCheckinSummary(): {
    totalStudents: number;
    totalOwing: number;
    totalWithCredits: number;
    totalBalanceOwed: number;
    totalCreditsAvailable: number;
  } {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as totalStudents,
        SUM(CASE WHEN balance < 0 THEN 1 ELSE 0 END) as totalOwing,
        SUM(CASE WHEN balance > 0 THEN 1 ELSE 0 END) as totalWithCredits,
        SUM(CASE WHEN balance < 0 THEN ABS(balance) ELSE 0 END) as totalBalanceOwed,
        SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END) as totalCreditsAvailable
      FROM checkin_students
      WHERE status = 'active'
    `);

    const result = stmt.get() as {
      totalStudents: number;
      totalOwing: number;
      totalWithCredits: number;
      totalBalanceOwed: number;
      totalCreditsAvailable: number;
    };

    return result || {
      totalStudents: 0,
      totalOwing: 0,
      totalWithCredits: 0,
      totalBalanceOwed: 0,
      totalCreditsAvailable: 0,
    };
  }

  // ===========================================================================
  // OPERAÇÕES DE ENQUETES ENVIADAS (SENT_POLLS)
  // ===========================================================================

  createSentPoll(poll: Omit<SentPollRecord, 'id' | 'createdAt'>): SentPollRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO sent_polls (schedule_id, template_id, group_id, message_id, message_key, title, options, sent_at, pinned_until, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        poll.scheduleId ?? null,
        poll.templateId ?? null,
        poll.groupId,
        poll.messageId,
        poll.messageKey,
        poll.title,
        JSON.stringify(poll.options),
        poll.sentAt,
        poll.pinnedUntil ?? null,
        now
      );

      return {
        id: result.lastInsertRowid as number,
        ...poll,
        createdAt: now,
      };
    } catch (error) {
      logger.error('[SQLite] Erro ao criar sent_poll:', error);
      return null;
    }
  }

  getSentPolls(filters?: { groupId?: string; limit?: number }): SentPollRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT id, schedule_id, template_id, group_id, message_id, message_key, title, options, sent_at, pinned_until, created_at
      FROM sent_polls
    `;

    const params: (string | number)[] = [];

    if (filters?.groupId) {
      query += ' WHERE group_id = ?';
      params.push(filters.groupId);
    }

    query += ' ORDER BY sent_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as SentPollRecordRaw[];
    return rows.map(this.parseSentPollRow);
  }

  getSentPollById(id: number): SentPollRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, schedule_id, template_id, group_id, message_id, message_key, title, options, sent_at, pinned_until, created_at
      FROM sent_polls
      WHERE id = ?
    `);

    const row = stmt.get(id) as SentPollRecordRaw | undefined;
    return row ? this.parseSentPollRow(row) : null;
  }

  updateSentPollPinned(id: number, pinnedUntil: string | null): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const stmt = this.db.prepare(`
        UPDATE sent_polls SET pinned_until = ? WHERE id = ?
      `);
      const result = stmt.run(pinnedUntil, id);
      return result.changes > 0;
    } catch (error) {
      logger.error('[SQLite] Erro ao atualizar pinned_until:', error);
      return false;
    }
  }

  deleteSentPoll(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const stmt = this.db.prepare('DELETE FROM sent_polls WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      logger.error('[SQLite] Erro ao deletar sent_poll:', error);
      return false;
    }
  }

  private parseSentPollRow(row: SentPollRecordRaw): SentPollRecord {
    return {
      id: row.id,
      scheduleId: row.schedule_id ?? undefined,
      templateId: row.template_id ?? undefined,
      groupId: row.group_id,
      messageId: row.message_id,
      messageKey: row.message_key,
      title: row.title,
      options: JSON.parse(row.options || '[]'),
      sentAt: row.sent_at,
      pinnedUntil: row.pinned_until ?? undefined,
      createdAt: row.created_at,
    };
  }

  isReady(): boolean {
    return this.db !== null;
  }

  // ===========================================================================
  // OPERAÇÕES DE CAIXA (CASH TRANSACTIONS)
  // ===========================================================================

  /**
   * Lista transações de caixa com filtros opcionais
   */
  getCashTransactions(filters?: {
    unit?: string;
    type?: string;
    category?: string;
    startDate?: string;
    endDate?: string;
    installmentId?: number;
  }): CashTransactionRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT id, unit, type, category, description, amount, payment_method, date,
             reference_id, reference_type, installment_id, notes,
             created_at, updated_at
      FROM cash_transactions
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filters?.unit) {
      query += ' AND unit = ?';
      params.push(filters.unit);
    }

    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters?.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters?.startDate) {
      query += ' AND date >= ?';
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      query += ' AND date <= ?';
      params.push(filters.endDate);
    }

    if (filters?.installmentId) {
      query += ' AND installment_id = ?';
      params.push(filters.installmentId);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as CashTransactionRecordRaw[];

    return rows.map(row => ({
      id: row.id,
      unit: row.unit,
      type: row.type as 'income' | 'expense',
      category: row.category,
      description: row.description,
      amount: row.amount,
      paymentMethod: row.payment_method as 'pix' | 'dinheiro' | 'cartao' | 'transferencia' | 'outro',
      date: row.date,
      referenceId: row.reference_id ?? undefined,
      referenceType: row.reference_type ?? undefined,
      installmentId: row.installment_id ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Busca transação por ID
   */
  getCashTransactionById(id: number): CashTransactionRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, unit, type, category, description, amount, payment_method, date,
             reference_id, reference_type, installment_id, notes,
             created_at, updated_at
      FROM cash_transactions
      WHERE id = ?
    `);

    const row = stmt.get(id) as CashTransactionRecordRaw | undefined;
    if (!row) return null;

    return {
      id: row.id,
      unit: row.unit,
      type: row.type as 'income' | 'expense',
      category: row.category,
      description: row.description,
      amount: row.amount,
      paymentMethod: row.payment_method as 'pix' | 'dinheiro' | 'cartao' | 'transferencia' | 'outro',
      date: row.date,
      referenceId: row.reference_id ?? undefined,
      referenceType: row.reference_type ?? undefined,
      installmentId: row.installment_id ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Cria nova transação de caixa
   */
  createCashTransaction(data: Omit<CashTransactionRecord, 'id' | 'createdAt' | 'updatedAt'>): CashTransactionRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO cash_transactions (unit, type, category, description, amount, payment_method, date,
                                       reference_id, reference_type, installment_id, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        data.unit,
        data.type,
        data.category,
        data.description,
        data.amount,
        data.paymentMethod,
        data.date,
        data.referenceId ?? null,
        data.referenceType ?? null,
        data.installmentId ?? null,
        data.notes ?? null,
        now,
        now
      );

      return {
        id: result.lastInsertRowid as number,
        ...data,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      logger.error('[SQLite] Erro ao criar transação de caixa', error);
      return null;
    }
  }

  /**
   * Atualiza transação de caixa
   */
  updateCashTransaction(id: number, updates: Partial<CashTransactionRecord>): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (updates.type !== undefined) {
        fields.push('type = ?');
        values.push(updates.type);
      }
      if (updates.category !== undefined) {
        fields.push('category = ?');
        values.push(updates.category);
      }
      if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description);
      }
      if (updates.amount !== undefined) {
        fields.push('amount = ?');
        values.push(updates.amount);
      }
      if (updates.paymentMethod !== undefined) {
        fields.push('payment_method = ?');
        values.push(updates.paymentMethod);
      }
      if (updates.date !== undefined) {
        fields.push('date = ?');
        values.push(updates.date);
      }
      if (updates.notes !== undefined) {
        fields.push('notes = ?');
        values.push(updates.notes);
      }

      if (fields.length === 0) return false;

      fields.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      const stmt = this.db.prepare(`
        UPDATE cash_transactions SET ${fields.join(', ')} WHERE id = ?
      `);
      const result = stmt.run(...values);
      return result.changes > 0;
    } catch (error) {
      logger.error('[SQLite] Erro ao atualizar transação de caixa', error);
      return false;
    }
  }

  /**
   * Remove transação de caixa
   */
  deleteCashTransaction(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM cash_transactions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Remove transação de caixa por referência (ex: quando um pagamento é removido)
   */
  deleteCashTransactionByReference(referenceId: number, referenceType: string): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM cash_transactions WHERE reference_id = ? AND reference_type = ?');
    const result = stmt.run(referenceId, referenceType);
    return result.changes > 0;
  }

  /**
   * Obtém resumo do caixa
   */
  getCashSummary(filters?: { unit?: string; startDate?: string; endDate?: string }): CashSummary {
    if (!this.db) throw new Error('Database not initialized');

    let whereClause = '';
    const params: unknown[] = [];

    if (filters?.unit) {
      whereClause += ' AND unit = ?';
      params.push(filters.unit);
    }

    if (filters?.startDate) {
      whereClause += ' AND date >= ?';
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      whereClause += ' AND date <= ?';
      params.push(filters.endDate);
    }

    // Total de entradas e saídas
    const totalsStmt = this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
      FROM cash_transactions
      WHERE 1=1 ${whereClause}
    `);
    const totals = totalsStmt.get(...params) as { total_income: number; total_expense: number };

    // Por categoria
    const byCategoryStmt = this.db.prepare(`
      SELECT category, type,
             SUM(amount) as total
      FROM cash_transactions
      WHERE 1=1 ${whereClause}
      GROUP BY category, type
    `);
    const categoryRows = byCategoryStmt.all(...params) as Array<{ category: string; type: string; total: number }>;

    const byCategory: Record<string, { income: number; expense: number }> = {};
    for (const row of categoryRows) {
      if (!byCategory[row.category]) {
        byCategory[row.category] = { income: 0, expense: 0 };
      }
      if (row.type === 'income') {
        byCategory[row.category]!.income = row.total;
      } else {
        byCategory[row.category]!.expense = row.total;
      }
    }

    // Por método de pagamento
    const byMethodStmt = this.db.prepare(`
      SELECT payment_method,
             SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) as total
      FROM cash_transactions
      WHERE 1=1 ${whereClause}
      GROUP BY payment_method
    `);
    const methodRows = byMethodStmt.all(...params) as Array<{ payment_method: string; total: number }>;

    const byPaymentMethod: Record<string, number> = {};
    for (const row of methodRows) {
      byPaymentMethod[row.payment_method] = row.total;
    }

    return {
      totalIncome: totals.total_income,
      totalExpense: totals.total_expense,
      balance: totals.total_income - totals.total_expense,
      byCategory,
      byPaymentMethod,
    };
  }

  /**
   * Obtém relatório mensal do caixa
   */
  getCashMonthlyReport(month: string): {
    summary: CashSummary;
    transactions: CashTransactionRecord[];
    dailyTotals: Array<{ date: string; income: number; expense: number }>;
  } {
    if (!this.db) throw new Error('Database not initialized');

    const startDate = `${month}-01`;
    const [year, monthNum] = month.split('-').map(Number);
    const lastDay = new Date(year!, monthNum!, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    const summary = this.getCashSummary({ startDate, endDate });
    const transactions = this.getCashTransactions({ startDate, endDate });

    // Totais diários
    const dailyStmt = this.db.prepare(`
      SELECT date,
             SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
             SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
      FROM cash_transactions
      WHERE date >= ? AND date <= ?
      GROUP BY date
      ORDER BY date
    `);
    const dailyRows = dailyStmt.all(startDate, endDate) as Array<{ date: string; income: number; expense: number }>;

    return {
      summary,
      transactions,
      dailyTotals: dailyRows,
    };
  }

  // ===========================================================================
  // OPERAÇÕES DE PARCELAMENTOS (INSTALLMENTS)
  // ===========================================================================

  /**
   * Lista parcelamentos com filtros opcionais
   */
  getInstallments(filters?: { unit?: string; status?: string; category?: string }): InstallmentRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT id, unit, description, total_amount, installment_count, paid_count,
             category, start_date, status, notes, created_at, updated_at
      FROM installments
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filters?.unit) {
      query += ' AND unit = ?';
      params.push(filters.unit);
    }

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters?.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as InstallmentRecordRaw[];

    return rows.map(row => ({
      id: row.id,
      unit: row.unit,
      description: row.description,
      totalAmount: row.total_amount,
      installmentCount: row.installment_count,
      paidCount: row.paid_count,
      category: row.category,
      startDate: row.start_date,
      status: row.status as 'active' | 'completed' | 'cancelled',
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Busca parcelamento por ID
   */
  getInstallmentById(id: number): InstallmentRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, unit, description, total_amount, installment_count, paid_count,
             category, start_date, status, notes, created_at, updated_at
      FROM installments
      WHERE id = ?
    `);

    const row = stmt.get(id) as InstallmentRecordRaw | undefined;
    if (!row) return null;

    return {
      id: row.id,
      unit: row.unit,
      description: row.description,
      totalAmount: row.total_amount,
      installmentCount: row.installment_count,
      paidCount: row.paid_count,
      category: row.category,
      startDate: row.start_date,
      status: row.status as 'active' | 'completed' | 'cancelled',
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Cria novo parcelamento
   */
  createInstallment(data: Omit<InstallmentRecord, 'id' | 'paidCount' | 'createdAt' | 'updatedAt'>): InstallmentRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO installments (unit, description, total_amount, installment_count, paid_count,
                                  category, start_date, status, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        data.unit,
        data.description,
        data.totalAmount,
        data.installmentCount,
        data.category,
        data.startDate,
        data.status || 'active',
        data.notes ?? null,
        now,
        now
      );

      return {
        id: result.lastInsertRowid as number,
        ...data,
        paidCount: 0,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      logger.error('[SQLite] Erro ao criar parcelamento', error);
      return null;
    }
  }

  /**
   * Atualiza parcelamento
   */
  updateInstallment(id: number, updates: Partial<InstallmentRecord>): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description);
      }
      if (updates.totalAmount !== undefined) {
        fields.push('total_amount = ?');
        values.push(updates.totalAmount);
      }
      if (updates.installmentCount !== undefined) {
        fields.push('installment_count = ?');
        values.push(updates.installmentCount);
      }
      if (updates.paidCount !== undefined) {
        fields.push('paid_count = ?');
        values.push(updates.paidCount);
      }
      if (updates.category !== undefined) {
        fields.push('category = ?');
        values.push(updates.category);
      }
      if (updates.startDate !== undefined) {
        fields.push('start_date = ?');
        values.push(updates.startDate);
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }
      if (updates.notes !== undefined) {
        fields.push('notes = ?');
        values.push(updates.notes);
      }

      if (fields.length === 0) return false;

      fields.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      const stmt = this.db.prepare(`
        UPDATE installments SET ${fields.join(', ')} WHERE id = ?
      `);
      const result = stmt.run(...values);
      return result.changes > 0;
    } catch (error) {
      logger.error('[SQLite] Erro ao atualizar parcelamento', error);
      return false;
    }
  }

  /**
   * Registra pagamento de parcela (despesa)
   */
  payInstallment(installmentId: number, paymentMethod: string, notes?: string): CashTransactionRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    const installment = this.getInstallmentById(installmentId);
    if (!installment) return null;

    if (installment.paidCount >= installment.installmentCount) {
      logger.warn('[SQLite] Parcelamento já completamente pago');
      return null;
    }

    const installmentValue = Math.round(installment.totalAmount / installment.installmentCount);
    const currentNumber = installment.paidCount + 1;

    // Criar transação de saída (despesa) - parcelamentos são pagamentos de despesas
    const transaction = this.createCashTransaction({
      unit: installment.unit,
      type: 'expense',
      category: installment.category,
      description: `${installment.description} - Parcela ${currentNumber}/${installment.installmentCount}`,
      amount: installmentValue,
      paymentMethod: paymentMethod as 'pix' | 'dinheiro' | 'cartao' | 'transferencia' | 'outro',
      date: new Date().toISOString().split('T')[0]!,
      installmentId: installmentId,
      notes,
    });

    if (transaction) {
      // Atualizar contador de parcelas pagas
      const newPaidCount = installment.paidCount + 1;
      const newStatus = newPaidCount >= installment.installmentCount ? 'completed' : 'active';
      this.updateInstallment(installmentId, { paidCount: newPaidCount, status: newStatus });
    }

    return transaction;
  }

  /**
   * Remove parcelamento (marca como cancelado)
   */
  deleteInstallment(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    return this.updateInstallment(id, { status: 'cancelled' });
  }

  /**
   * Obtém transações de um parcelamento
   */
  getInstallmentTransactions(installmentId: number): CashTransactionRecord[] {
    return this.getCashTransactions({ installmentId });
  }

  // ===========================================================================
  // OPERAÇÕES DE NOTIFICAÇÕES
  // ===========================================================================

  /**
   * Cria uma nova notificação
   */
  createNotification(data: {
    type: string;
    title: string;
    message: string;
    icon?: string;
    link?: string;
    referenceId?: number;
    referenceType?: string;
  }): NotificationRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const stmt = this.db.prepare(`
        INSERT INTO notifications (type, title, message, icon, link, reference_id, reference_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        data.type,
        data.title,
        data.message,
        data.icon ?? null,
        data.link ?? null,
        data.referenceId ?? null,
        data.referenceType ?? null
      );

      return {
        id: result.lastInsertRowid as number,
        type: data.type,
        title: data.title,
        message: data.message,
        icon: data.icon,
        link: data.link,
        referenceId: data.referenceId,
        referenceType: data.referenceType,
        read: false,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('[SQLite] Erro ao criar notificação', error);
      return null;
    }
  }

  /**
   * Busca notificações com filtros
   */
  getNotifications(filters?: {
    read?: boolean;
    type?: string;
    limit?: number;
    offset?: number;
  }): { notifications: NotificationRecord[]; total: number; unreadCount: number } {
    if (!this.db) throw new Error('Database not initialized');

    let whereClause = '';
    const params: unknown[] = [];

    if (filters?.read !== undefined) {
      whereClause += ' AND read = ?';
      params.push(filters.read ? 1 : 0);
    }

    if (filters?.type) {
      whereClause += ' AND type = ?';
      params.push(filters.type);
    }

    // Count total
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE 1=1 ${whereClause}`);
    const countResult = countStmt.get(...params) as { count: number };

    // Count unread
    const unreadStmt = this.db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE read = 0`);
    const unreadResult = unreadStmt.get() as { count: number };

    // Fetch notifications
    let query = `
      SELECT id, type, title, message, icon, link, reference_id, reference_type, read, created_at
      FROM notifications
      WHERE 1=1 ${whereClause}
      ORDER BY created_at DESC
    `;

    if (filters?.limit) {
      query += ` LIMIT ${filters.limit}`;
      if (filters?.offset) {
        query += ` OFFSET ${filters.offset}`;
      }
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      id: number;
      type: string;
      title: string;
      message: string;
      icon: string | null;
      link: string | null;
      reference_id: number | null;
      reference_type: string | null;
      read: number;
      created_at: string;
    }>;

    const notifications: NotificationRecord[] = rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      icon: row.icon ?? undefined,
      link: row.link ?? undefined,
      referenceId: row.reference_id ?? undefined,
      referenceType: row.reference_type ?? undefined,
      read: row.read === 1,
      createdAt: row.created_at,
    }));

    return {
      notifications,
      total: countResult.count,
      unreadCount: unreadResult.count,
    };
  }

  /**
   * Marca notificação como lida
   */
  markNotificationRead(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('UPDATE notifications SET read = 1 WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Marca todas as notificações como lidas
   */
  markAllNotificationsRead(): number {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('UPDATE notifications SET read = 1 WHERE read = 0');
    const result = stmt.run();
    return result.changes;
  }

  /**
   * Remove uma notificação
   */
  deleteNotification(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM notifications WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Remove notificações antigas (mais de X dias)
   */
  deleteOldNotifications(daysOld: number = 30): number {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      DELETE FROM notifications
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(daysOld);
    return result.changes;
  }

  // ===========================================================================
  // OPERAÇÕES DE ALUNOS UNIFICADOS
  // ===========================================================================

  getUnifiedStudents(filters?: { unit?: string; paymentType?: string; status?: string; search?: string }): UnifiedStudentRecord[] {
    if (!this.db) throw new Error('Database not initialized');

    let query = `
      SELECT id, name, phone, email, birth_date as birthDate, unit, payment_type as paymentType,
             plan, plan_value as planValue, due_day as dueDay, start_date as startDate,
             platform, balance, status, notes, created_at as createdAt, updated_at as updatedAt
      FROM unified_students
      WHERE 1=1
    `;
    const values: unknown[] = [];

    if (filters?.unit) {
      query += ' AND unit = ?';
      values.push(filters.unit);
    }
    if (filters?.paymentType) {
      query += ' AND payment_type = ?';
      values.push(filters.paymentType);
    }
    if (filters?.status) {
      query += ' AND status = ?';
      values.push(filters.status);
    }
    if (filters?.search) {
      query += ' AND (name LIKE ? OR phone LIKE ?)';
      values.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    query += ' ORDER BY name ASC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...values) as UnifiedStudentRecordRaw[];
    return rows.map(this.parseUnifiedStudentRow);
  }

  getUnifiedStudentById(id: number): UnifiedStudentRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT id, name, phone, email, birth_date as birthDate, unit, payment_type as paymentType,
             plan, plan_value as planValue, due_day as dueDay, start_date as startDate,
             platform, balance, status, notes, created_at as createdAt, updated_at as updatedAt
      FROM unified_students WHERE id = ?
    `);

    const row = stmt.get(id) as UnifiedStudentRecordRaw | undefined;
    return row ? this.parseUnifiedStudentRow(row) : null;
  }

  getUnifiedStudentByPhone(phone: string): UnifiedStudentRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    const normalizedPhone = phone.replace(/\D/g, '');
    const stmt = this.db.prepare(`
      SELECT id, name, phone, email, birth_date as birthDate, unit, payment_type as paymentType,
             plan, plan_value as planValue, due_day as dueDay, start_date as startDate,
             platform, balance, status, notes, created_at as createdAt, updated_at as updatedAt
      FROM unified_students WHERE REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '+', '') LIKE ?
    `);

    const row = stmt.get(`%${normalizedPhone}%`) as UnifiedStudentRecordRaw | undefined;
    return row ? this.parseUnifiedStudentRow(row) : null;
  }

  createUnifiedStudent(student: Omit<UnifiedStudentRecord, 'id' | 'createdAt' | 'updatedAt'>): UnifiedStudentRecord | null {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO unified_students (name, phone, email, birth_date, unit, payment_type,
                                      plan, plan_value, due_day, start_date,
                                      platform, balance, status, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        student.name,
        student.phone,
        student.email ?? null,
        student.birthDate ?? null,
        student.unit,
        student.paymentType,
        student.plan ?? null,
        student.planValue ?? null,
        student.dueDay ?? null,
        student.startDate ?? null,
        student.platform ?? null,
        student.balance ?? 0,
        student.status,
        student.notes ?? null,
        now,
        now
      );

      return {
        id: result.lastInsertRowid as number,
        ...student,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      logger.error('[SQLite] Erro ao criar aluno unificado', error);
      return null;
    }
  }

  updateUnifiedStudent(id: number, student: Partial<Omit<UnifiedStudentRecord, 'id' | 'createdAt' | 'updatedAt'>>): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const updates: string[] = [];
      const values: unknown[] = [];

      if (student.name !== undefined) { updates.push('name = ?'); values.push(student.name); }
      if (student.phone !== undefined) { updates.push('phone = ?'); values.push(student.phone); }
      if (student.email !== undefined) { updates.push('email = ?'); values.push(student.email); }
      if (student.birthDate !== undefined) { updates.push('birth_date = ?'); values.push(student.birthDate); }
      if (student.unit !== undefined) { updates.push('unit = ?'); values.push(student.unit); }
      if (student.paymentType !== undefined) { updates.push('payment_type = ?'); values.push(student.paymentType); }
      if (student.plan !== undefined) { updates.push('plan = ?'); values.push(student.plan); }
      if (student.planValue !== undefined) { updates.push('plan_value = ?'); values.push(student.planValue); }
      if (student.dueDay !== undefined) { updates.push('due_day = ?'); values.push(student.dueDay); }
      if (student.startDate !== undefined) { updates.push('start_date = ?'); values.push(student.startDate); }
      if (student.platform !== undefined) { updates.push('platform = ?'); values.push(student.platform); }
      if (student.balance !== undefined) { updates.push('balance = ?'); values.push(student.balance); }
      if (student.status !== undefined) { updates.push('status = ?'); values.push(student.status); }
      if (student.notes !== undefined) { updates.push('notes = ?'); values.push(student.notes); }

      if (updates.length === 0) return false;

      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      const stmt = this.db.prepare(`UPDATE unified_students SET ${updates.join(', ')} WHERE id = ?`);
      const result = stmt.run(...values);

      return result.changes > 0;
    } catch (error) {
      logger.error(`[SQLite] Erro ao atualizar aluno unificado #${id}`, error);
      return false;
    }
  }

  deleteUnifiedStudent(id: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM unified_students WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  updateUnifiedStudentBalance(id: number, amount: number): boolean {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const stmt = this.db.prepare(`
        UPDATE unified_students
        SET balance = balance + ?, updated_at = ?
        WHERE id = ?
      `);
      const result = stmt.run(amount, new Date().toISOString(), id);
      return result.changes > 0;
    } catch (error) {
      logger.error(`[SQLite] Erro ao atualizar saldo do aluno #${id}`, error);
      return false;
    }
  }

  getUnifiedStudentsSummary(): {
    total: number;
    mensalidade: number;
    plataforma: number;
    active: number;
    inactive: number;
    byUnit: { recreio: number; bangu: number };
  } {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN payment_type = 'mensalidade' THEN 1 ELSE 0 END) as mensalidade,
        SUM(CASE WHEN payment_type = 'plataforma' THEN 1 ELSE 0 END) as plataforma,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN unit = 'recreio' THEN 1 ELSE 0 END) as recreio,
        SUM(CASE WHEN unit = 'bangu' THEN 1 ELSE 0 END) as bangu
      FROM unified_students
    `);

    const result = stmt.get() as {
      total: number;
      mensalidade: number;
      plataforma: number;
      active: number;
      inactive: number;
      recreio: number;
      bangu: number;
    };

    return {
      total: result?.total || 0,
      mensalidade: result?.mensalidade || 0,
      plataforma: result?.plataforma || 0,
      active: result?.active || 0,
      inactive: result?.inactive || 0,
      byUnit: {
        recreio: result?.recreio || 0,
        bangu: result?.bangu || 0,
      },
    };
  }

  private parseUnifiedStudentRow(row: UnifiedStudentRecordRaw): UnifiedStudentRecord {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email ?? undefined,
      birthDate: row.birthDate ?? undefined,
      unit: row.unit as 'recreio' | 'bangu',
      paymentType: row.paymentType as 'mensalidade' | 'plataforma',
      plan: row.plan ?? undefined,
      planValue: row.planValue ?? undefined,
      dueDay: row.dueDay ?? undefined,
      startDate: row.startDate ?? undefined,
      platform: row.platform as 'wellhub' | 'totalpass' | 'gurupass' | undefined,
      balance: row.balance ?? 0,
      status: row.status as 'active' | 'inactive' | 'suspended',
      notes: row.notes ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// Singleton
const sqliteService = new SQLiteService();
export default sqliteService;
