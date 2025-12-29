import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock axios
const mockPost = vi.fn(() => Promise.resolve({ status: 200 }));
vi.mock('axios', () => ({
  default: {
    post: mockPost,
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

describe('AlertService', () => {
  const originalEnv = process.env.SLACK_WEBHOOK_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.SLACK_WEBHOOK_URL = originalEnv;
  });

  describe('quando webhook não está configurado', () => {
    it('não deve enviar alertas', async () => {
      delete process.env.SLACK_WEBHOOK_URL;

      vi.resetModules();
      const { default: alertService } = await import('../../src/infra/alerts.js');

      await alertService.send({
        level: 'error',
        title: 'Teste',
        message: 'Mensagem de teste',
      });

      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('quando webhook está configurado', () => {
    it('deve permitir criar alertService', async () => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

      vi.resetModules();
      const { default: alertService } = await import('../../src/infra/alerts.js');

      expect(alertService).toBeDefined();
      expect(typeof alertService.send).toBe('function');
      expect(typeof alertService.critical).toBe('function');
      expect(typeof alertService.error).toBe('function');
      expect(typeof alertService.warning).toBe('function');
      expect(typeof alertService.info).toBe('function');
    });

    it('deve ter métodos pré-definidos', async () => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

      vi.resetModules();
      const { default: alertService } = await import('../../src/infra/alerts.js');

      expect(typeof alertService.onWhatsAppDisconnect).toBe('function');
      expect(typeof alertService.onWhatsAppReconnect).toBe('function');
      expect(typeof alertService.onHighMemoryUsage).toBe('function');
      expect(typeof alertService.onHighErrorRate).toBe('function');
      expect(typeof alertService.onCircuitBreakerOpen).toBe('function');
      expect(typeof alertService.onBackupCompleted).toBe('function');
    });
  });
});
