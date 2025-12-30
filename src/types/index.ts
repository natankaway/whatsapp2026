import type { WASocket, WAMessage, BaileysEventMap, proto } from '@whiskeysockets/baileys';

// ============================================
// TIPOS DO CLIENTE WHATSAPP
// ============================================

export type WhatsAppSocket = WASocket;
export type Message = WAMessage;
export type MessageContent = proto.IMessage;

export interface ConnectionState {
  isConnected: boolean;
  qrCode?: string;
  lastDisconnect?: {
    error: Error;
    date: Date;
  };
}

// ============================================
// TIPOS DE SESSÃO DO USUÁRIO
// ============================================

export type SessionState =
  | 'menu'
  | 'units'
  | 'prices'
  | 'faq'
  | 'experimental_unit'
  | 'experimental_date'
  | 'experimental_time'
  | 'experimental_name'
  | 'experimental_companion'
  | 'experimental_companion_name'
  | 'experimental_confirm'
  | 'waiting_message';

export interface UserSession {
  state: SessionState;
  isPaused: boolean;
  lastActivity: number;
  data?: Record<string, unknown>;
}

export interface ExperimentalSession {
  unidade?: 'RECREIO' | 'BANGU';
  filePath?: string;
  selectedDate?: Date;
  selectedTime?: string;
  availableTimes?: string[];
  name?: string;
  companion?: string | null;
}

// ============================================
// TIPOS DE COMANDOS
// ============================================

export interface CommandContext {
  sock: WhatsAppSocket;
  from: string;
  text: string;
  message: Message;
  isGroup: boolean;
  session: UserSession;
  args: string[];
}

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  category: 'menu' | 'group' | 'admin' | 'experimental';
  isGroupOnly?: boolean;
  isPrivateOnly?: boolean;
  execute: (ctx: CommandContext) => Promise<void>;
}

export interface CommandRegistry {
  commands: Map<string, Command>;
  aliases: Map<string, string>;
}

// ============================================
// TIPOS DE EVENTOS
// ============================================

export type BotEventType =
  | 'connection.update'
  | 'creds.update'
  | 'messages.upsert'
  | 'group-participants.update';

export interface BotEvent<T extends keyof BaileysEventMap> {
  name: T;
  execute: (sock: WhatsAppSocket, data: BaileysEventMap[T]) => Promise<void>;
}

// ============================================
// TIPOS DE CONFIGURAÇÃO
// ============================================

export interface UnitPrice {
  frequencia: string;
  valor: string;
}

export interface Unit {
  id: number;
  nome: string;
  endereco: string;
  local: string;
  diasFuncionamento: string;
  horarios: string[];
  horariosTexto?: string[];
  aulaoSabado?: string;
  precos: {
    mensalidade: UnitPrice[];
    avulsa: string;
  };
  plataformas: string[];
}

export interface FAQ {
  pergunta: string;
  resposta: string;
}

export interface AppConfig {
  empresa: {
    nome: string;
    esporte: string;
    horarioAtendimento: {
      inicio: string;
      fim: string;
      diasUteis: number[];
    };
  };
  telegram: {
    recreioToken: string;
    banguToken: string;
    notificationChatIds: string[];
    authorizedUserIds: number[];
  };
  gruposWhatsApp: {
    recreio: string;
    bangu: string;
  };
  paths: {
    data: string;
    backups: string;
    logs: string;
    auth: string;
  };
  jsonFilePaths: {
    recreio: string;
    bangu: string;
  };
  unidades: Unit[];
  menuPrincipal: string;
  faq: FAQ[];
  nomesEnquetes: Record<string, string[]>;
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
  session: {
    timeout: number;
    cleanupInterval: number;
  };
  reminder: {
    enabled: boolean;
    reminder24h: boolean;
    reminder2h: boolean;
    confirmationRequired: boolean;
    confirmationDeadlineHours: number;
  };
  dashboard: {
    enabled: boolean;
    port: number;
    username: string;
    password: string;
  };
}

// ============================================
// TIPOS DE AGENDA
// ============================================

export interface AgendaEntry {
  name: string;
  phone?: string;
  createdAt?: string;
}

export interface AgendaData {
  [date: string]: {
    [time: string]: AgendaEntry[];
  };
}

// ============================================
// TIPOS DE NOTIFICAÇÃO
// ============================================

export interface BookingDetails {
  unidade: string;
  name: string;
  companion?: string | null;
  selectedDate: Date;
  selectedTime: string;
}

export interface NotificationResult {
  chatId: string;
  messageId?: number;
  success: boolean;
  error?: string;
}

// ============================================
// TIPOS DE MIDDLEWARE
// ============================================

export interface MiddlewareContext {
  sock: WhatsAppSocket;
  message: Message;
  from: string;
  text: string;
  isGroup: boolean;
}

export type MiddlewareNext = () => Promise<void>;

export type Middleware = (ctx: MiddlewareContext, next: MiddlewareNext) => Promise<void>;

// ============================================
// TIPOS DE RESPOSTA DE BOTÃO
// ============================================

export interface ButtonResponse {
  type: 'button' | 'list' | 'interactive';
  id: string;
  text?: string;
}

// ============================================
// TIPOS DE POLL
// ============================================

export interface PollOptions {
  name: string;
  values: string[];
  selectableCount?: number;
}
