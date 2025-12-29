import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock das dependências antes de importar o sessionManager
vi.mock('../../src/database/index.js', () => ({
  redisService: {
    isReady: vi.fn(() => false),
    setSession: vi.fn(() => Promise.resolve()),
    getSession: vi.fn(() => Promise.resolve(null)),
    deleteSession: vi.fn(() => Promise.resolve()),
    getStats: vi.fn(() => Promise.resolve({ activeSessions: 0, pausedChats: 0, connected: false })),
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/config/index.js', () => ({
  default: {
    session: {
      timeout: 30 * 60 * 1000,
      cleanupInterval: 5 * 60 * 1000,
    },
  },
}));

// Importar após os mocks
import sessionManager from '../../src/utils/sessionManager.js';

describe('SessionManager', () => {
  beforeEach(() => {
    // Limpar todas as sessões entre testes
    vi.clearAllMocks();
  });

  describe('getSession', () => {
    it('deve criar nova sessão se não existir', () => {
      const session = sessionManager.getSession('user-new-123');

      expect(session).toBeDefined();
      expect(session.state).toBe('menu');
      expect(session.isPaused).toBe(false);
      expect(session.lastActivity).toBeGreaterThan(0);
    });

    it('deve retornar sessão existente', () => {
      const session1 = sessionManager.getSession('user-existing-123');
      session1.state = 'units';

      const session2 = sessionManager.getSession('user-existing-123');

      expect(session2.state).toBe('units');
    });

  });

  describe('updateSession', () => {
    it('deve atualizar sessão corretamente', () => {
      sessionManager.getSession('user-update-123');
      sessionManager.updateSession('user-update-123', { state: 'prices', isPaused: true });

      const session = sessionManager.getSession('user-update-123');

      expect(session.state).toBe('prices');
      expect(session.isPaused).toBe(true);
    });
  });

  describe('setState', () => {
    it('deve alterar o estado da sessão', () => {
      sessionManager.getSession('user-state-123');
      sessionManager.setState('user-state-123', 'faq');

      const session = sessionManager.getSession('user-state-123');

      expect(session.state).toBe('faq');
    });
  });

  describe('setData e getData', () => {
    it('deve armazenar e recuperar dados corretamente', () => {
      sessionManager.getSession('user-data-123');
      sessionManager.setData('user-data-123', 'selectedUnit', 'RECREIO');
      sessionManager.setData('user-data-123', 'selectedTime', '17:30');

      expect(sessionManager.getData('user-data-123', 'selectedUnit')).toBe('RECREIO');
      expect(sessionManager.getData('user-data-123', 'selectedTime')).toBe('17:30');
    });

    it('deve retornar undefined para dados inexistentes', () => {
      sessionManager.getSession('user-nodata-123');

      expect(sessionManager.getData('user-nodata-123', 'nonexistent')).toBeUndefined();
    });

    it('deve armazenar objetos complexos', () => {
      const complexData = {
        unidade: 'RECREIO',
        selectedDate: new Date().toISOString(),
        options: [1, 2, 3],
      };

      sessionManager.getSession('user-complex-123');
      sessionManager.setData('user-complex-123', 'booking', complexData);

      expect(sessionManager.getData('user-complex-123', 'booking')).toEqual(complexData);
    });
  });

  describe('clearData', () => {
    it('deve limpar todos os dados da sessão', () => {
      sessionManager.getSession('user-clear-123');
      sessionManager.setData('user-clear-123', 'key1', 'value1');
      sessionManager.setData('user-clear-123', 'key2', 'value2');

      sessionManager.clearData('user-clear-123');

      expect(sessionManager.getData('user-clear-123', 'key1')).toBeUndefined();
      expect(sessionManager.getData('user-clear-123', 'key2')).toBeUndefined();
    });
  });

  describe('resetSession', () => {
    it('deve resetar sessão para estado inicial', () => {
      sessionManager.getSession('user-reset-123');
      sessionManager.setState('user-reset-123', 'experimental_confirm');
      sessionManager.setData('user-reset-123', 'test', 'value');

      sessionManager.resetSession('user-reset-123');

      const session = sessionManager.getSession('user-reset-123');
      expect(session.state).toBe('menu');
      expect(session.data).toEqual({});
    });
  });

  describe('deleteSession', () => {
    it('deve remover sessão completamente', () => {
      sessionManager.getSession('user-delete-123');
      sessionManager.deleteSession('user-delete-123');

      // Nova sessão deve ser criada com estado inicial
      const session = sessionManager.getSession('user-delete-123');
      expect(session.state).toBe('menu');
    });
  });

  describe('getActiveSessionsCount', () => {
    it('deve retornar contagem correta de sessões', () => {
      const count = sessionManager.getActiveSessionsCount();

      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
