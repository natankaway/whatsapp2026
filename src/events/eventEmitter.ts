import type { BaileysEventMap } from '@whiskeysockets/baileys';
import type { WhatsAppSocket } from '../types/index.js';
import logger from '../utils/logger.js';

type EventHandler<T extends keyof BaileysEventMap> = (
  sock: WhatsAppSocket,
  data: BaileysEventMap[T]
) => Promise<void>;

type EventHandlers = {
  [K in keyof BaileysEventMap]?: EventHandler<K>[];
};

export class EventEmitter {
  private handlers: EventHandlers = {};

  on<T extends keyof BaileysEventMap>(event: T, handler: EventHandler<T>): void {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    (this.handlers[event] as EventHandler<T>[]).push(handler);
  }

  off<T extends keyof BaileysEventMap>(event: T, handler: EventHandler<T>): void {
    const handlers = this.handlers[event] as EventHandler<T>[] | undefined;
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async emit<T extends keyof BaileysEventMap>(
    event: T,
    sock: WhatsAppSocket,
    data: BaileysEventMap[T]
  ): Promise<void> {
    const handlers = this.handlers[event] as EventHandler<T>[] | undefined;
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        await handler(sock, data);
      } catch (error) {
        logger.error(`Erro no handler do evento ${event}`, error);
      }
    }
  }

  clear(): void {
    this.handlers = {};
  }
}
