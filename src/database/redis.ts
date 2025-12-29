import Redis from 'ioredis';
import type { UserSession, SessionState, ExperimentalSession } from '../types/index.js';
import CONFIG from '../config/index.js';
import logger from '../utils/logger.js';

// =============================================================================
// REDIS SERVICE
// =============================================================================
// Gerencia sessões de usuário e estado de pausa com persistência em Redis.
// Garante que o estado do bot não seja perdido em reinicializações.
// =============================================================================

// Prefixos para organizar as chaves no Redis
const KEYS = {
  SESSION: 'session:',
  PAUSE: 'pause:',
  EXPERIMENTAL: 'experimental:',
  RATE_LIMIT: 'ratelimit:',
} as const;

// TTL padrão para sessões (30 minutos)
const SESSION_TTL = Math.floor(CONFIG.session.timeout / 1000);
const PAUSE_DEFAULT_TTL = 30 * 60; // 30 minutos em segundos

class RedisService {
  private client: Redis | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;

  // ===========================================================================
  // INICIALIZAÇÃO
  // ===========================================================================

  async initialize(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > this.maxReconnectAttempts) {
            logger.error('[Redis] Número máximo de tentativas de reconexão atingido');
            return null;
          }
          const delay = Math.min(times * 500, 5000);
          logger.warn(`[Redis] Reconectando em ${delay}ms (tentativa ${times})`);
          return delay;
        },
        lazyConnect: true,
      });

      // Event handlers
      this.client.on('connect', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        logger.info('[Redis] Conectado');
      });

      this.client.on('error', (error) => {
        logger.error('[Redis] Erro de conexão', error);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        logger.warn('[Redis] Conexão fechada');
      });

      this.client.on('reconnecting', () => {
        this.reconnectAttempts++;
        logger.info(`[Redis] Reconectando... (tentativa ${this.reconnectAttempts})`);
      });

      await this.client.connect();
      logger.info(`[Redis] Serviço inicializado: ${redisUrl}`);
    } catch (error) {
      logger.error('[Redis] Falha ao conectar', error);
      // Não lançar erro - permitir que o bot funcione sem Redis (fallback para memória)
      this.client = null;
    }
  }

  // ===========================================================================
  // OPERAÇÕES DE SESSÃO
  // ===========================================================================

  /**
   * Obtém ou cria uma sessão de usuário
   */
  async getSession(userId: string): Promise<UserSession> {
    if (!this.client || !this.isConnected) {
      return this.createDefaultSession();
    }

    try {
      const key = KEYS.SESSION + userId;
      const data = await this.client.get(key);

      if (data) {
        const session = JSON.parse(data) as UserSession;
        // Renovar TTL a cada acesso
        await this.client.expire(key, SESSION_TTL);
        return session;
      }

      // Criar nova sessão
      const newSession = this.createDefaultSession();
      await this.setSession(userId, newSession);
      return newSession;
    } catch (error) {
      logger.error(`[Redis] Erro ao obter sessão: ${userId}`, error);
      return this.createDefaultSession();
    }
  }

  /**
   * Salva uma sessão de usuário
   */
  async setSession(userId: string, session: UserSession): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      const key = KEYS.SESSION + userId;
      await this.client.setex(key, SESSION_TTL, JSON.stringify(session));
    } catch (error) {
      logger.error(`[Redis] Erro ao salvar sessão: ${userId}`, error);
    }
  }

  /**
   * Atualiza parcialmente uma sessão
   */
  async updateSession(userId: string, updates: Partial<UserSession>): Promise<void> {
    const session = await this.getSession(userId);
    const updatedSession: UserSession = {
      ...session,
      ...updates,
      lastActivity: Date.now(),
    };
    await this.setSession(userId, updatedSession);
  }

  /**
   * Atualiza apenas o estado da sessão
   */
  async setState(userId: string, state: SessionState): Promise<void> {
    await this.updateSession(userId, { state });
  }

  /**
   * Define dados específicos na sessão
   */
  async setData<T>(userId: string, key: string, value: T): Promise<void> {
    const session = await this.getSession(userId);
    session.data = session.data ?? {};
    session.data[key] = value;
    await this.setSession(userId, session);
  }

  /**
   * Obtém dados específicos da sessão
   */
  async getData<T>(userId: string, key: string): Promise<T | undefined> {
    const session = await this.getSession(userId);
    return session.data?.[key] as T | undefined;
  }

  /**
   * Limpa dados da sessão
   */
  async clearData(userId: string): Promise<void> {
    const session = await this.getSession(userId);
    session.data = {};
    await this.setSession(userId, session);
  }

  /**
   * Remove uma sessão
   */
  async deleteSession(userId: string): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      const key = KEYS.SESSION + userId;
      await this.client.del(key);
      logger.debug(`[Redis] Sessão removida: ${userId}`);
    } catch (error) {
      logger.error(`[Redis] Erro ao remover sessão: ${userId}`, error);
    }
  }

  /**
   * Reseta uma sessão para o estado inicial
   */
  async resetSession(userId: string): Promise<void> {
    const newSession = this.createDefaultSession();
    await this.setSession(userId, newSession);
    logger.debug(`[Redis] Sessão resetada: ${userId}`);
  }

  private createDefaultSession(): UserSession {
    return {
      state: 'menu',
      isPaused: false,
      lastActivity: Date.now(),
      data: {},
    };
  }

  // ===========================================================================
  // OPERAÇÕES DE EXPERIMENTAL SESSION (AGENDAMENTO)
  // ===========================================================================

  async getExperimental(userId: string): Promise<ExperimentalSession | null> {
    if (!this.client || !this.isConnected) return null;

    try {
      const key = KEYS.EXPERIMENTAL + userId;
      const data = await this.client.get(key);
      return data ? (JSON.parse(data) as ExperimentalSession) : null;
    } catch (error) {
      logger.error(`[Redis] Erro ao obter experimental: ${userId}`, error);
      return null;
    }
  }

  async setExperimental(userId: string, data: ExperimentalSession): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      const key = KEYS.EXPERIMENTAL + userId;
      // TTL de 1 hora para fluxo de agendamento
      await this.client.setex(key, 60 * 60, JSON.stringify(data));
    } catch (error) {
      logger.error(`[Redis] Erro ao salvar experimental: ${userId}`, error);
    }
  }

  async deleteExperimental(userId: string): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      const key = KEYS.EXPERIMENTAL + userId;
      await this.client.del(key);
    } catch (error) {
      logger.error(`[Redis] Erro ao remover experimental: ${userId}`, error);
    }
  }

  // ===========================================================================
  // OPERAÇÕES DE PAUSA
  // ===========================================================================

  /**
   * Pausa o bot para um chat específico
   */
  async pauseBot(chatId: string, durationSeconds?: number): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      const key = KEYS.PAUSE + chatId;
      const ttl = durationSeconds ?? PAUSE_DEFAULT_TTL;
      await this.client.setex(key, ttl, Date.now().toString());
      logger.info(`[Redis] Bot pausado para ${chatId} por ${ttl}s`);
    } catch (error) {
      logger.error(`[Redis] Erro ao pausar bot: ${chatId}`, error);
    }
  }

  /**
   * Verifica se o bot está pausado para um chat
   */
  async isPaused(chatId: string): Promise<boolean> {
    if (!this.client || !this.isConnected) return false;

    try {
      const key = KEYS.PAUSE + chatId;
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error(`[Redis] Erro ao verificar pausa: ${chatId}`, error);
      return false;
    }
  }

  /**
   * Retoma o bot para um chat
   */
  async resumeBot(chatId: string): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      const key = KEYS.PAUSE + chatId;
      await this.client.del(key);
      logger.info(`[Redis] Bot retomado para ${chatId}`);
    } catch (error) {
      logger.error(`[Redis] Erro ao retomar bot: ${chatId}`, error);
    }
  }

  /**
   * Obtém tempo restante de pausa
   */
  async getPauseRemaining(chatId: string): Promise<number> {
    if (!this.client || !this.isConnected) return 0;

    try {
      const key = KEYS.PAUSE + chatId;
      const ttl = await this.client.ttl(key);
      return ttl > 0 ? ttl : 0;
    } catch {
      return 0;
    }
  }

  // ===========================================================================
  // RATE LIMITING
  // ===========================================================================

  /**
   * Verifica e incrementa rate limit
   * Retorna { allowed: boolean, remaining: number }
   */
  async checkRateLimit(
    chatId: string,
    maxRequests: number = CONFIG.rateLimit.maxRequests,
    windowSeconds: number = Math.floor(CONFIG.rateLimit.windowMs / 1000)
  ): Promise<{ allowed: boolean; remaining: number; shouldWarn: boolean }> {
    if (!this.client || !this.isConnected) {
      return { allowed: true, remaining: maxRequests, shouldWarn: false };
    }

    try {
      const key = KEYS.RATE_LIMIT + chatId;
      const multi = this.client.multi();

      multi.incr(key);
      multi.ttl(key);

      const results = await multi.exec();
      if (!results || !results[0] || !results[1]) {
        return { allowed: true, remaining: maxRequests, shouldWarn: false };
      }

      const count = results[0][1] as number;
      const ttl = results[1][1] as number;

      // Se é a primeira requisição, definir TTL
      if (ttl === -1) {
        await this.client.expire(key, windowSeconds);
      }

      const remaining = Math.max(0, maxRequests - count);
      const allowed = count <= maxRequests;
      const shouldWarn = count === maxRequests; // Avisar no limite

      return { allowed, remaining, shouldWarn };
    } catch (error) {
      logger.error(`[Redis] Erro no rate limit: ${chatId}`, error);
      return { allowed: true, remaining: maxRequests, shouldWarn: false };
    }
  }

  // ===========================================================================
  // ESTATÍSTICAS
  // ===========================================================================

  async getStats(): Promise<{
    activeSessions: number;
    pausedChats: number;
    connected: boolean;
  }> {
    if (!this.client || !this.isConnected) {
      return { activeSessions: 0, pausedChats: 0, connected: false };
    }

    try {
      const sessionKeys = await this.client.keys(KEYS.SESSION + '*');
      const pauseKeys = await this.client.keys(KEYS.PAUSE + '*');

      return {
        activeSessions: sessionKeys.length,
        pausedChats: pauseKeys.length,
        connected: true,
      };
    } catch {
      return { activeSessions: 0, pausedChats: 0, connected: this.isConnected };
    }
  }

  // ===========================================================================
  // ENCERRAMENTO
  // ===========================================================================

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      logger.info('[Redis] Conexão fechada');
    }
  }

  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }
}

// Singleton
const redisService = new RedisService();
export default redisService;
