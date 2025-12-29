import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
  ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';

import CONFIG from '../config/index.js';
import logger from '../utils/logger.js';
import sessionManager from '../utils/sessionManager.js';
import { EventEmitter } from '../events/eventEmitter.js';
import type { WhatsAppSocket } from '../types/index.js';

class WhatsAppService {
  private sock: WhatsAppSocket | null = null;
  private eventEmitter: EventEmitter;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private isShuttingDown = false;
  private connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private lastConnectionTime: number = 0;

  constructor() {
    this.eventEmitter = new EventEmitter();
  }

  async start(): Promise<void> {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(CONFIG.paths.auth);
      
      // Buscar versão mais recente do WhatsApp Web
      let version: [number, number, number];
      try {
        const versionInfo = await fetchLatestBaileysVersion();
        version = versionInfo.version;
        
        // Se a versão for muito antiga, usar uma mais recente
        // Versão mínima: 2.24.x.x (2024)
        if (version[0] < 2 || (version[0] === 2 && version[1] < 2400)) {
          version = [2, 2413, 51];
          logger.warn(`Versão obtida muito antiga, usando: ${version.join('.')}`);
        } else {
          logger.info(`Versão WA Web obtida: ${version.join('.')} (isLatest: ${versionInfo.isLatest})`);
        }
      } catch (error) {
        // Fallback para versão mais recente conhecida se falhar
        version = [2, 2413, 51];
        logger.warn(`Falha ao buscar versão, usando fallback: ${version.join('.')}`);
      }

      logger.info(`Iniciando Baileys v7 com versão WA: ${version.join('.')}`);

      // Logger silencioso para Baileys
      const baileysLogger = pino({ level: 'silent' });

      this.sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
        },
        version,
        printQRInTerminal: false,
        browser: ['CT LK Futevôlei', 'Chrome', '120.0.0'],
        
        // Handler para mensagens não encontradas
        getMessage: async () => {
          return { conversation: '' };
        },

        // Otimizações
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        emitOwnEvents: true,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        retryRequestDelayMs: 500,
        
        // Ignorar broadcasts
        shouldIgnoreJid: (jid) => isJidBroadcast(jid),
        
        logger: baileysLogger,
      });

      this.setupEventHandlers(saveCreds);
      logger.info('Serviço WhatsApp inicializado');
    } catch (error) {
      logger.error('Erro ao iniciar serviço WhatsApp', error);
      throw error;
    }
  }

  private setupEventHandlers(saveCreds: () => Promise<void>): void {
    if (!this.sock) return;

    // Evento de atualização de conexão
    this.sock.ev.on('connection.update', (update) => {
      this.handleConnectionUpdate(update);
    });

    // Salvar credenciais
    this.sock.ev.on('creds.update', saveCreds);

    // Mensagens recebidas
    this.sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;
      await this.eventEmitter.emit('messages.upsert', this.sock!, m);
    });

    // Capturar mapeamento de contatos (LID <-> JID)
    this.sock.ev.on('contacts.update', async (contacts) => {
      for (const contact of contacts) {
        // Log para debug - ver estrutura do contato
        if (contact.id || contact.lid) {
          logger.debug(`Contato atualizado: id=${contact.id}, lid=${contact.lid}`);
        }
      }
    });

    // Capturar associação via messages.update (quando mensagem é atualizada)
    this.sock.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        // Verificar se há informação de participant que pode ajudar no mapeamento
        if (update.key && update.update) {
          const key = update.key;
          // Log para debug - ajuda a entender a estrutura
          logger.debug(`Message update: ${JSON.stringify(key)}`);
        }
      }
    });

    // Atualização de participantes do grupo
    this.sock.ev.on('group-participants.update', async (update) => {
      await this.eventEmitter.emit('group-participants.update', this.sock!, update);
    });

    // Atualização de grupos
    this.sock.ev.on('groups.update', async (updates) => {
      logger.debug(`Grupos atualizados: ${updates.length}`);
    });
  }

  private async handleConnectionUpdate(update: Partial<ConnectionState>): Promise<void> {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('QR Code recebido, escaneie para conectar:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      this.connectionState = 'disconnected';
      const error = lastDisconnect?.error as Boom | undefined;
      const statusCode = error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.error(`Conexão fechada. Código: ${statusCode}`, error);

      if (shouldReconnect && !this.isShuttingDown) {
        this.reconnectAttempts++;

        if (this.reconnectAttempts <= this.maxReconnectAttempts) {
          const delay = Math.min(5000 * this.reconnectAttempts, 30000);
          logger.info(`Reconectando em ${delay / 1000}s... (tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

          await new Promise((resolve) => setTimeout(resolve, delay));
          await this.start();
        } else {
          logger.error('Número máximo de tentativas de reconexão atingido');
          // Resetar contador e tentar novamente após 5 minutos
          setTimeout(async () => {
            logger.info('Tentando reconectar após período de espera...');
            this.reconnectAttempts = 0;
            await this.start();
          }, 5 * 60 * 1000);
        }
      } else if (statusCode === DisconnectReason.loggedOut) {
        logger.warn('Sessão deslogada. Execute novamente para escanear QR Code.');
      }
    } else if (connection === 'open') {
      this.reconnectAttempts = 0;
      this.connectionState = 'connected';
      this.lastConnectionTime = Date.now();
      logger.info('✅ Bot CT LK Futevôlei conectado com sucesso!');
      logger.connection('Conectado');

      // Iniciar timer de limpeza de sessões
      sessionManager.startCleanupTimer();
    } else if (connection === 'connecting') {
      this.connectionState = 'connecting';
      logger.info('🔄 Conectando ao WhatsApp...');
    }
  }

  getSocket(): WhatsAppSocket | null {
    return this.sock;
  }

  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true;
    sessionManager.stopCleanupTimer();

    if (this.sock) {
      // NÃO fazer logout - apenas desconectar para manter a sessão válida
      try {
        this.sock.end(undefined);
      } catch {
        // Ignorar erro ao desconectar
      }
      this.sock = null;
    }

    logger.info('Serviço WhatsApp parado');
  }

  isConnected(): boolean {
    return this.connectionState === 'connected' && this.sock?.user !== undefined;
  }

  /**
   * Retorna o estado atual da conexão
   */
  getConnectionState(): 'disconnected' | 'connecting' | 'connected' {
    return this.connectionState;
  }

  /**
   * Retorna há quanto tempo está conectado (em ms)
   */
  getConnectionUptime(): number {
    if (this.connectionState !== 'connected') return 0;
    return Date.now() - this.lastConnectionTime;
  }

  /**
   * Verifica se a conexão está estável (conectado há mais de X segundos)
   */
  isConnectionStable(minUptimeMs: number = 5000): boolean {
    return this.isConnected() && this.getConnectionUptime() >= minUptimeMs;
  }
}

// Singleton
const whatsappService = new WhatsAppService();
export default whatsappService;
