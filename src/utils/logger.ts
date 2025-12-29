import pino, { Logger as PinoLogger } from 'pino';
import path from 'path';
import fs from 'fs';
import CONFIG from '../config/index.js';

// Garantir que o diretório de logs existe
if (!fs.existsSync(CONFIG.paths.logs)) {
  fs.mkdirSync(CONFIG.paths.logs, { recursive: true });
}

const isDevelopment = process.env.NODE_ENV !== 'production';

// Configuração de transporte para desenvolvimento e produção
const transport = isDevelopment
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        messageFormat: '{msg}',
      },
    }
  : {
      targets: [
        {
          target: 'pino/file',
          options: { destination: path.join(CONFIG.paths.logs, 'combined.log') },
          level: 'info',
        },
        {
          target: 'pino/file',
          options: { destination: path.join(CONFIG.paths.logs, 'error.log') },
          level: 'error',
        },
      ],
    };

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport,
  base: {
    pid: false,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Wrapper para adicionar métodos úteis
class Logger {
  private logger: PinoLogger;

  constructor(logger: PinoLogger) {
    this.logger = logger;
  }

  info(message: string, data?: Record<string, unknown>): void {
    if (data) {
      this.logger.info(data, message);
    } else {
      this.logger.info(message);
    }
  }

  error(message: string, error?: unknown): void {
    if (error instanceof Error) {
      this.logger.error({ err: error }, message);
    } else if (error) {
      this.logger.error({ data: error }, message);
    } else {
      this.logger.error(message);
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (data) {
      this.logger.warn(data, message);
    } else {
      this.logger.warn(message);
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (data) {
      this.logger.debug(data, message);
    } else {
      this.logger.debug(message);
    }
  }

  child(bindings: Record<string, unknown>): Logger {
    return new Logger(this.logger.child(bindings));
  }

  // Métodos de conveniência para o bot
  connection(status: string): void {
    this.info(`🔗 Conexão: ${status}`);
  }

  messageReceived(from: string, isGroup: boolean): void {
    const type = isGroup ? 'Grupo' : 'Privado';
    this.debug(`📨 Mensagem recebida [${type}]: ${from}`);
  }

  commandExecuted(command: string, user: string): void {
    this.info(`⚡ Comando executado: ${command} por ${user}`);
  }

  bookingCreated(name: string, unit: string, date: string): void {
    this.info(`📅 Agendamento criado: ${name} - ${unit} - ${date}`);
  }

  pollCreated(title: string, group: string): void {
    this.info(`📊 Enquete criada: "${title}" no grupo ${group}`);
  }
}

const logger = new Logger(baseLogger);

export default logger;
export { Logger };
