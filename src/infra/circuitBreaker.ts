import CircuitBreaker from 'opossum';
import logger from '../utils/logger.js';
import metricsService from './metrics.js';

// =============================================================================
// CIRCUIT BREAKER SERVICE
// =============================================================================
// Implementa o padrão Circuit Breaker para proteger a aplicação contra
// falhas em cascata quando serviços externos estão indisponíveis.
// =============================================================================

// Configurações padrão do circuit breaker
const DEFAULT_OPTIONS: CircuitBreaker.Options = {
  timeout: 10000, // 10 segundos
  errorThresholdPercentage: 50, // Abre após 50% de erros
  resetTimeout: 30000, // Tenta fechar após 30 segundos
  volumeThreshold: 5, // Mínimo de 5 requisições para considerar
  rollingCountTimeout: 10000, // Janela de 10 segundos para métricas
  rollingCountBuckets: 10, // 10 buckets de 1 segundo
};

// =============================================================================
// TIPOS
// =============================================================================

interface CircuitBreakerStats {
  name: string;
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  successes: number;
  fallbacks: number;
  timeouts: number;
  cacheHits: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => Promise<any>;

// =============================================================================
// CIRCUIT BREAKER FACTORY
// =============================================================================

class CircuitBreakerFactory {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private breakers: Map<string, CircuitBreaker<any>> = new Map();

  /**
   * Cria ou retorna um circuit breaker existente
   */
  create(
    name: string,
    action: AnyFunction,
    options: Partial<CircuitBreaker.Options> = {},
    fallback?: AnyFunction
  ): CircuitBreaker {
    // Verificar se já existe
    if (this.breakers.has(name)) {
      return this.breakers.get(name)!;
    }

    // Criar novo circuit breaker
    const breaker = new CircuitBreaker(action, {
      ...DEFAULT_OPTIONS,
      ...options,
      name,
    });

    // Configurar fallback se fornecido
    if (fallback) {
      breaker.fallback(fallback);
    }

    // Configurar event listeners
    this.setupEventListeners(breaker, name);

    // Armazenar
    this.breakers.set(name, breaker);

    logger.info(`[CircuitBreaker] Criado: ${name}`);
    return breaker;
  }

  private setupEventListeners(breaker: CircuitBreaker, name: string): void {
    breaker.on('success', () => {
      logger.debug(`[CircuitBreaker:${name}] Sucesso`);
    });

    breaker.on('timeout', () => {
      logger.warn(`[CircuitBreaker:${name}] Timeout`);
      metricsService.recordMessageError('circuit_breaker_timeout');
    });

    breaker.on('reject', () => {
      logger.warn(`[CircuitBreaker:${name}] Rejeitado (circuito aberto)`);
      metricsService.recordMessageError('circuit_breaker_rejected');
    });

    breaker.on('open', () => {
      logger.error(`[CircuitBreaker:${name}] Circuito ABERTO - serviço indisponível`);
    });

    breaker.on('halfOpen', () => {
      logger.info(`[CircuitBreaker:${name}] Circuito HALF-OPEN - testando serviço`);
    });

    breaker.on('close', () => {
      logger.info(`[CircuitBreaker:${name}] Circuito FECHADO - serviço restaurado`);
    });

    breaker.on('fallback', () => {
      logger.debug(`[CircuitBreaker:${name}] Usando fallback`);
    });

    breaker.on('failure', (error) => {
      logger.error(`[CircuitBreaker:${name}] Falha`, error);
      metricsService.recordMessageError('circuit_breaker_failure');
    });
  }

  /**
   * Obtém estatísticas de todos os circuit breakers
   */
  getStats(): CircuitBreakerStats[] {
    const stats: CircuitBreakerStats[] = [];

    for (const [name, breaker] of this.breakers) {
      const breakerStats = breaker.stats;
      const state = breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed';

      stats.push({
        name,
        state,
        failures: breakerStats.failures,
        successes: breakerStats.successes,
        fallbacks: breakerStats.fallbacks,
        timeouts: breakerStats.timeouts,
        cacheHits: breakerStats.cacheHits,
      });
    }

    return stats;
  }

  /**
   * Obtém um circuit breaker por nome
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Fecha todos os circuit breakers
   */
  shutdown(): void {
    for (const [name, breaker] of this.breakers) {
      breaker.shutdown();
      logger.debug(`[CircuitBreaker] Encerrado: ${name}`);
    }
    this.breakers.clear();
  }
}

// Singleton
const circuitBreakerFactory = new CircuitBreakerFactory();

// =============================================================================
// CIRCUIT BREAKERS PRÉ-CONFIGURADOS
// =============================================================================

/**
 * Circuit breaker para envio de mensagens WhatsApp
 */
export function createWhatsAppBreaker(action: AnyFunction): CircuitBreaker {
  return circuitBreakerFactory.create(
    'whatsapp-send',
    action,
    {
      timeout: 15000, // 15 segundos para enviar mensagem
      errorThresholdPercentage: 30, // Mais sensível para WhatsApp
      resetTimeout: 60000, // 1 minuto para tentar reconectar
    }
  );
}

/**
 * Circuit breaker para notificações Telegram
 */
export function createTelegramBreaker(action: AnyFunction): CircuitBreaker {
  return circuitBreakerFactory.create(
    'telegram-notify',
    action,
    {
      timeout: 10000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    },
    // Fallback: logar e continuar
    async () => {
      logger.warn('[CircuitBreaker:telegram-notify] Fallback ativado - notificação não enviada');
      return { success: false, fallback: true };
    }
  );
}

/**
 * Circuit breaker para operações de banco de dados
 */
export function createDatabaseBreaker(action: AnyFunction): CircuitBreaker {
  return circuitBreakerFactory.create(
    'database',
    action,
    {
      timeout: 5000, // 5 segundos para operações de banco
      errorThresholdPercentage: 40,
      resetTimeout: 10000, // Tenta mais rápido
    }
  );
}

/**
 * Circuit breaker para Redis
 */
export function createRedisBreaker(action: AnyFunction): CircuitBreaker {
  return circuitBreakerFactory.create(
    'redis',
    action,
    {
      timeout: 3000, // Redis deve ser rápido
      errorThresholdPercentage: 60,
      resetTimeout: 15000,
    }
  );
}

// Exportar factory para uso customizado
export { circuitBreakerFactory };
export default circuitBreakerFactory;
