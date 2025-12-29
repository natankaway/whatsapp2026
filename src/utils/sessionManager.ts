import type { UserSession, SessionState } from '../types/index.js';
import { redisService } from '../database/index.js';
import CONFIG from '../config/index.js';
import logger from './logger.js';

// =============================================================================
// SESSION MANAGER COM SUPORTE A REDIS
// =============================================================================
// Gerencia sessões de usuário com Redis para persistência.
// Fallback para memória quando Redis não está disponível.
// API síncrona mantida para compatibilidade, usando cache local.
// =============================================================================

class SessionManager {
  private sessions: Map<string, UserSession>;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private dirtyKeys: Set<string> = new Set();

  constructor() {
    this.sessions = new Map();
  }

  // ===========================================================================
  // API SÍNCRONA (COMPATIBILIDADE)
  // ===========================================================================

  getSession(userId: string): UserSession {
    let session = this.sessions.get(userId);

    if (!session) {
      session = this.createSession();
      this.sessions.set(userId, session);
      this.markDirty(userId);
    }

    session.lastActivity = Date.now();
    return session;
  }

  private createSession(): UserSession {
    return {
      state: 'menu',
      isPaused: false,
      lastActivity: Date.now(),
      data: {},
    };
  }

  updateSession(userId: string, updates: Partial<UserSession>): void {
    const session = this.getSession(userId);
    Object.assign(session, updates, { lastActivity: Date.now() });
    this.sessions.set(userId, session);
    this.markDirty(userId);
  }

  setState(userId: string, state: SessionState): void {
    this.updateSession(userId, { state });
  }

  setData<T>(userId: string, key: string, value: T): void {
    const session = this.getSession(userId);
    session.data = session.data ?? {};
    session.data[key] = value;
    session.lastActivity = Date.now();
    this.markDirty(userId);
  }

  getData<T>(userId: string, key: string): T | undefined {
    const session = this.sessions.get(userId);
    return session?.data?.[key] as T | undefined;
  }

  clearData(userId: string): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.data = {};
      this.markDirty(userId);
    }
  }

  deleteSession(userId: string): void {
    this.sessions.delete(userId);
    this.dirtyKeys.delete(userId);

    // Remover do Redis também
    redisService.deleteSession(userId).catch((err) => {
      logger.error(`Erro ao remover sessão do Redis: ${userId}`, err);
    });

    logger.debug(`Sessão removida: ${userId}`);
  }

  resetSession(userId: string): void {
    this.sessions.set(userId, this.createSession());
    this.markDirty(userId);
    logger.debug(`Sessão resetada: ${userId}`);
  }

  // ===========================================================================
  // SINCRONIZAÇÃO COM REDIS
  // ===========================================================================

  private markDirty(userId: string): void {
    this.dirtyKeys.add(userId);
  }

  /**
   * Sincroniza sessões modificadas com o Redis
   * Chamado periodicamente pelo timer
   */
  private async syncToRedis(): Promise<void> {
    if (this.dirtyKeys.size === 0 || !redisService.isReady()) {
      return;
    }

    const keysToSync = Array.from(this.dirtyKeys);
    this.dirtyKeys.clear();

    for (const userId of keysToSync) {
      const session = this.sessions.get(userId);
      if (session) {
        try {
          await redisService.setSession(userId, session);
        } catch (error) {
          logger.error(`Erro ao sincronizar sessão com Redis: ${userId}`, error);
          // Re-adicionar à lista de dirty para tentar novamente
          this.dirtyKeys.add(userId);
        }
      }
    }
  }

  /**
   * Carrega sessão do Redis (usado na inicialização ou quando não está em cache)
   */
  async loadFromRedis(userId: string): Promise<UserSession | null> {
    if (!redisService.isReady()) {
      return null;
    }

    try {
      const session = await redisService.getSession(userId);
      if (session) {
        this.sessions.set(userId, session);
        return session;
      }
    } catch (error) {
      logger.error(`Erro ao carregar sessão do Redis: ${userId}`, error);
    }

    return null;
  }

  // ===========================================================================
  // TIMERS
  // ===========================================================================

  startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Timer de limpeza de sessões expiradas
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, CONFIG.session.cleanupInterval);

    // Timer de sincronização com Redis (a cada 5 segundos)
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(() => {
      this.syncToRedis().catch((err) => {
        logger.error('Erro na sincronização com Redis', err);
      });
    }, 5000);

    logger.info('Timer de limpeza de sessões iniciado');
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // Sincronizar pendentes antes de parar
    this.syncToRedis().catch(() => {});

    logger.info('Timer de limpeza de sessões parado');
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > CONFIG.session.timeout) {
        this.sessions.delete(userId);
        this.dirtyKeys.delete(userId);

        // Remover do Redis também
        redisService.deleteSession(userId).catch(() => {});

        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Sessões expiradas removidas: ${cleaned}`);
    }
  }

  // ===========================================================================
  // ESTATÍSTICAS
  // ===========================================================================

  getActiveSessionsCount(): number {
    return this.sessions.size;
  }

  async getRedisStats(): Promise<{ activeSessions: number; pausedChats: number; connected: boolean }> {
    return redisService.getStats();
  }
}

// Singleton
const sessionManager = new SessionManager();
export default sessionManager;
