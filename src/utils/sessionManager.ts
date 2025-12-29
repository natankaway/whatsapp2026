import type { UserSession, SessionState } from '../types/index.js';
import CONFIG from '../config/index.js';
import logger from './logger.js';

class SessionManager {
  private sessions: Map<string, UserSession>;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.sessions = new Map();
  }

  getSession(userId: string): UserSession {
    let session = this.sessions.get(userId);

    if (!session) {
      session = this.createSession();
      this.sessions.set(userId, session);
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
  }

  setState(userId: string, state: SessionState): void {
    this.updateSession(userId, { state });
  }

  setData<T>(userId: string, key: string, value: T): void {
    const session = this.getSession(userId);
    session.data = session.data ?? {};
    session.data[key] = value;
    session.lastActivity = Date.now();
  }

  getData<T>(userId: string, key: string): T | undefined {
    const session = this.sessions.get(userId);
    return session?.data?.[key] as T | undefined;
  }

  clearData(userId: string): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.data = {};
    }
  }

  deleteSession(userId: string): void {
    this.sessions.delete(userId);
    logger.debug(`Sessão removida: ${userId}`);
  }

  resetSession(userId: string): void {
    this.sessions.set(userId, this.createSession());
    logger.debug(`Sessão resetada: ${userId}`);
  }

  startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, CONFIG.session.cleanupInterval);

    logger.info('Timer de limpeza de sessões iniciado');
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.info('Timer de limpeza de sessões parado');
    }
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > CONFIG.session.timeout) {
        this.sessions.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Sessões expiradas removidas: ${cleaned}`);
    }
  }

  getActiveSessionsCount(): number {
    return this.sessions.size;
  }
}

// Singleton
const sessionManager = new SessionManager();
export default sessionManager;
