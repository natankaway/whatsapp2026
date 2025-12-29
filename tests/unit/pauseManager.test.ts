import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock das dependências
vi.mock('../../src/database/index.js', () => ({
  redisService: {
    isReady: vi.fn(() => false),
    pauseBot: vi.fn(),
    isPaused: vi.fn(() => false),
    resumeBot: vi.fn(),
    getPauseRemaining: vi.fn(() => 0),
    getStats: vi.fn(() => Promise.resolve({ pausedChats: 0 })),
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

// Importar após os mocks
import pauseManager from '../../src/utils/pauseManager.js';

describe('PauseManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    pauseManager.clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('pauseBot', () => {
    it('deve pausar o bot para um chat', async () => {
      await pauseManager.pauseBot('chat-123');

      expect(pauseManager.isPaused('chat-123')).toBe(true);
    });

    it('deve pausar com duração personalizada', async () => {
      await pauseManager.pauseBot('chat-custom', 60000); // 1 minuto

      expect(pauseManager.isPaused('chat-custom')).toBe(true);
    });
  });

  describe('pauseBotSync', () => {
    it('deve pausar sincronamente (compatibilidade)', () => {
      pauseManager.pauseBotSync('chat-sync');

      expect(pauseManager.isPaused('chat-sync')).toBe(true);
    });
  });

  describe('isPaused', () => {
    it('deve retornar false para chat não pausado', () => {
      expect(pauseManager.isPaused('chat-not-paused')).toBe(false);
    });

    it('deve retornar true para chat pausado', async () => {
      await pauseManager.pauseBot('chat-paused');

      expect(pauseManager.isPaused('chat-paused')).toBe(true);
    });
  });

  describe('resumeBot', () => {
    it('deve retomar o bot para um chat', async () => {
      await pauseManager.pauseBot('chat-resume');
      expect(pauseManager.isPaused('chat-resume')).toBe(true);

      await pauseManager.resumeBot('chat-resume');
      expect(pauseManager.isPaused('chat-resume')).toBe(false);
    });
  });

  describe('resumeBotSync', () => {
    it('deve retomar sincronamente (compatibilidade)', async () => {
      await pauseManager.pauseBot('chat-sync-resume');

      pauseManager.resumeBotSync('chat-sync-resume');

      expect(pauseManager.isPaused('chat-sync-resume')).toBe(false);
    });
  });

  describe('auto-resume', () => {
    it('deve retomar automaticamente após duração', async () => {
      await pauseManager.pauseBot('chat-auto', 5000); // 5 segundos

      expect(pauseManager.isPaused('chat-auto')).toBe(true);

      // Avançar o tempo
      vi.advanceTimersByTime(5000);

      expect(pauseManager.isPaused('chat-auto')).toBe(false);
    });
  });

  describe('getPausedCount', () => {
    it('deve retornar contagem correta de pausas', async () => {
      expect(pauseManager.getPausedCount()).toBe(0);

      await pauseManager.pauseBot('chat-1');
      await pauseManager.pauseBot('chat-2');

      expect(pauseManager.getPausedCount()).toBe(2);
    });
  });

  describe('clearAll', () => {
    it('deve limpar todas as pausas', async () => {
      await pauseManager.pauseBot('chat-1');
      await pauseManager.pauseBot('chat-2');

      pauseManager.clearAll();

      expect(pauseManager.getPausedCount()).toBe(0);
      expect(pauseManager.isPaused('chat-1')).toBe(false);
      expect(pauseManager.isPaused('chat-2')).toBe(false);
    });
  });

  describe('múltiplas pausas', () => {
    it('deve gerenciar múltiplos chats pausados independentemente', async () => {
      await pauseManager.pauseBot('chat-a');
      await pauseManager.pauseBot('chat-b');
      await pauseManager.pauseBot('chat-c');

      expect(pauseManager.isPaused('chat-a')).toBe(true);
      expect(pauseManager.isPaused('chat-b')).toBe(true);
      expect(pauseManager.isPaused('chat-c')).toBe(true);

      await pauseManager.resumeBot('chat-b');

      expect(pauseManager.isPaused('chat-a')).toBe(true);
      expect(pauseManager.isPaused('chat-b')).toBe(false);
      expect(pauseManager.isPaused('chat-c')).toBe(true);
    });
  });

  describe('re-pausar', () => {
    it('deve permitir pausar novamente um chat já pausado', async () => {
      await pauseManager.pauseBot('chat-repause', 10000);
      await pauseManager.pauseBot('chat-repause', 20000); // Nova duração

      expect(pauseManager.isPaused('chat-repause')).toBe(true);

      // Avançar 10 segundos - não deve retomar ainda
      vi.advanceTimersByTime(10000);
      expect(pauseManager.isPaused('chat-repause')).toBe(true);

      // Avançar mais 10 segundos - agora deve retomar
      vi.advanceTimersByTime(10000);
      expect(pauseManager.isPaused('chat-repause')).toBe(false);
    });
  });
});
