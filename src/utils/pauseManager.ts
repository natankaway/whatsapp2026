import logger from './logger.js';

class PauseManager {
  private pausedChats: Set<string>;
  private pauseTimers: Map<string, NodeJS.Timeout>;
  private readonly defaultPauseDuration = 30 * 60 * 1000; // 30 minutos

  constructor() {
    this.pausedChats = new Set();
    this.pauseTimers = new Map();
  }

  pauseBot(chatId: string, duration?: number): void {
    // Limpar timer anterior se existir
    this.clearTimer(chatId);

    this.pausedChats.add(chatId);
    logger.info(`Bot pausado para: ${chatId}`);

    // Configurar timer para retomar automaticamente
    const pauseDuration = duration ?? this.defaultPauseDuration;
    const timer = setTimeout(() => {
      this.resumeBot(chatId);
      logger.info(`Bot retomado automaticamente para: ${chatId}`);
    }, pauseDuration);

    this.pauseTimers.set(chatId, timer);
  }

  isPaused(chatId: string): boolean {
    return this.pausedChats.has(chatId);
  }

  resumeBot(chatId: string): void {
    this.pausedChats.delete(chatId);
    this.clearTimer(chatId);
    logger.info(`Bot retomado para: ${chatId}`);
  }

  private clearTimer(chatId: string): void {
    const timer = this.pauseTimers.get(chatId);
    if (timer) {
      clearTimeout(timer);
      this.pauseTimers.delete(chatId);
    }
  }

  getPausedCount(): number {
    return this.pausedChats.size;
  }

  clearAll(): void {
    for (const timer of this.pauseTimers.values()) {
      clearTimeout(timer);
    }
    this.pausedChats.clear();
    this.pauseTimers.clear();
  }
}

// Singleton
const pauseManager = new PauseManager();
export default pauseManager;
