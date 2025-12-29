import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/infra/metrics.js', () => ({
  default: {
    incrementCircuitBreakerState: vi.fn(),
    recordMessageError: vi.fn(),
  },
}));

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('criação de circuit breakers', () => {
    it('deve criar circuitBreakerFactory', async () => {
      const { default: circuitBreakerFactory } = await import('../../src/infra/circuitBreaker.js');

      expect(circuitBreakerFactory).toBeDefined();
      expect(typeof circuitBreakerFactory.create).toBe('function');
    });

    it('deve criar circuit breaker com opções padrão', async () => {
      const { default: circuitBreakerFactory } = await import('../../src/infra/circuitBreaker.js');

      const action = async () => 'success';
      const breaker = circuitBreakerFactory.create('test-breaker-1', action);

      expect(breaker).toBeDefined();
    });

    it('deve criar circuit breaker com opções customizadas', async () => {
      const { default: circuitBreakerFactory } = await import('../../src/infra/circuitBreaker.js');

      const action = async () => 'success';
      const breaker = circuitBreakerFactory.create('custom-breaker-1', action, {
        timeout: 5000,
        errorThresholdPercentage: 60,
        resetTimeout: 15000,
      });

      expect(breaker).toBeDefined();
    });
  });

  describe('circuit breakers pré-definidos', () => {
    it('deve criar WhatsApp breaker', async () => {
      const { createWhatsAppBreaker } = await import('../../src/infra/circuitBreaker.js');

      const action = async () => 'message sent';
      const breaker = createWhatsAppBreaker(action);

      expect(breaker).toBeDefined();
    });

    it('deve criar Telegram breaker', async () => {
      const { createTelegramBreaker } = await import('../../src/infra/circuitBreaker.js');

      const action = async () => 'notification sent';
      const breaker = createTelegramBreaker(action);

      expect(breaker).toBeDefined();
    });

    it('deve criar Database breaker', async () => {
      const { createDatabaseBreaker } = await import('../../src/infra/circuitBreaker.js');

      const action = async () => ({ rows: [] });
      const breaker = createDatabaseBreaker(action);

      expect(breaker).toBeDefined();
    });

    it('deve criar Redis breaker', async () => {
      const { createRedisBreaker } = await import('../../src/infra/circuitBreaker.js');

      const action = async () => 'OK';
      const breaker = createRedisBreaker(action);

      expect(breaker).toBeDefined();
    });
  });

  describe('execução de ações', () => {
    it('deve executar ação com sucesso', async () => {
      const { default: circuitBreakerFactory } = await import('../../src/infra/circuitBreaker.js');

      const action = async () => 'result';
      const breaker = circuitBreakerFactory.create('exec-test-1', action);

      const result = await breaker.fire();

      expect(result).toBe('result');
    });

    it('deve executar ação com argumentos', async () => {
      const { default: circuitBreakerFactory } = await import('../../src/infra/circuitBreaker.js');

      const action = async (a: number, b: number) => a + b;
      const breaker = circuitBreakerFactory.create('args-test-1', action);

      const result = await breaker.fire(5, 3);

      expect(result).toBe(8);
    });

    it('deve retornar estatísticas do breaker', async () => {
      const { default: circuitBreakerFactory } = await import('../../src/infra/circuitBreaker.js');

      const action = async () => 'success';
      const breaker = circuitBreakerFactory.create('stats-test-1', action);

      await breaker.fire();

      const stats = breaker.stats;
      expect(stats).toBeDefined();
    });
  });
});
