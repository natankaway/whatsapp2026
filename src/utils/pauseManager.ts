import { redisService } from '../database/index.js';
import logger from './logger.js';

// =============================================================================
// PAUSE MANAGER COM SUPORTE A REDIS
// =============================================================================
// Gerencia estado de pausa do bot com Redis para persistência.
// Fallback para memória quando Redis não está disponível.
// =============================================================================

class PauseManager {
  private pausedChats: Set<string>;
  private pauseTimers: Map<string, NodeJS.Timeout>;
  private readonly defaultPauseDuration = 30 * 60 * 1000; // 30 minutos

  constructor() {
    this.pausedChats = new Set();
    this.pauseTimers = new Map();
  }

  /**
   * Pausa o bot para um chat específico
   * Persiste no Redis se disponível
   */
  async pauseBot(chatId: string, duration?: number): Promise<void> {
    // Limpar timer anterior se existir
    this.clearTimer(chatId);

    const pauseDuration = duration ?? this.defaultPauseDuration;
    const pauseDurationSeconds = Math.floor(pauseDuration / 1000);

    // Persistir no Redis
    if (redisService.isReady()) {
      try {
        await redisService.pauseBot(chatId, pauseDurationSeconds);
      } catch (error) {
        logger.error(`Erro ao persistir pausa no Redis: ${chatId}`, error);
      }
    }

    // Manter em memória para acesso rápido
    this.pausedChats.add(chatId);
    logger.info(`Bot pausado para: ${chatId}`);

    // Configurar timer para retomar automaticamente
    const timer = setTimeout(() => {
      this.resumeBot(chatId);
      logger.info(`Bot retomado automaticamente para: ${chatId}`);
    }, pauseDuration);

    this.pauseTimers.set(chatId, timer);
  }

  /**
   * Versão síncrona para compatibilidade (não persiste imediatamente)
   */
  pauseBotSync(chatId: string, duration?: number): void {
    // Chamar versão async sem aguardar
    this.pauseBot(chatId, duration).catch((err) => {
      logger.error(`Erro ao pausar bot: ${chatId}`, err);
    });
  }

  /**
   * Verifica se o bot está pausado para um chat
   * Usa cache local para performance, com fallback para Redis
   */
  async isPausedAsync(chatId: string): Promise<boolean> {
    // Verificar cache local primeiro
    if (this.pausedChats.has(chatId)) {
      return true;
    }

    // Verificar no Redis se disponível
    if (redisService.isReady()) {
      try {
        const isPaused = await redisService.isPaused(chatId);
        if (isPaused) {
          // Sincronizar com cache local
          this.pausedChats.add(chatId);
          return true;
        }
      } catch (error) {
        logger.error(`Erro ao verificar pausa no Redis: ${chatId}`, error);
      }
    }

    return false;
  }

  /**
   * Versão síncrona para compatibilidade (usa apenas cache local)
   */
  isPaused(chatId: string): boolean {
    return this.pausedChats.has(chatId);
  }

  /**
   * Retoma o bot para um chat
   */
  async resumeBot(chatId: string): Promise<void> {
    this.pausedChats.delete(chatId);
    this.clearTimer(chatId);

    // Remover do Redis
    if (redisService.isReady()) {
      try {
        await redisService.resumeBot(chatId);
      } catch (error) {
        logger.error(`Erro ao remover pausa do Redis: ${chatId}`, error);
      }
    }

    logger.info(`Bot retomado para: ${chatId}`);
  }

  /**
   * Versão síncrona para compatibilidade
   */
  resumeBotSync(chatId: string): void {
    this.resumeBot(chatId).catch((err) => {
      logger.error(`Erro ao retomar bot: ${chatId}`, err);
    });
  }

  private clearTimer(chatId: string): void {
    const timer = this.pauseTimers.get(chatId);
    if (timer) {
      clearTimeout(timer);
      this.pauseTimers.delete(chatId);
    }
  }

  /**
   * Obtém o tempo restante de pausa em segundos
   */
  async getPauseRemaining(chatId: string): Promise<number> {
    if (redisService.isReady()) {
      try {
        return await redisService.getPauseRemaining(chatId);
      } catch {
        return 0;
      }
    }
    return 0;
  }

  getPausedCount(): number {
    return this.pausedChats.size;
  }

  /**
   * Sincroniza estado de pausa do Redis para cache local
   * Chamado na inicialização
   */
  async syncFromRedis(): Promise<void> {
    if (!redisService.isReady()) {
      return;
    }

    try {
      const stats = await redisService.getStats();
      logger.info(`[PauseManager] ${stats.pausedChats} chats pausados no Redis`);
    } catch (error) {
      logger.error('Erro ao sincronizar pausas do Redis', error);
    }
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
