import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Context for tracking correlation across async operations
 */
interface RequestContext {
  correlationId: string;
  userId?: string;
  source?: 'whatsapp' | 'telegram' | 'system';
  startTime: number;
}

// AsyncLocalStorage para manter contexto através de chamadas async
const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Generates a new correlation ID
 */
export function generateCorrelationId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Gets the current correlation ID from context
 */
export function getCorrelationId(): string | undefined {
  return asyncLocalStorage.getStore()?.correlationId;
}

/**
 * Gets the current request context
 */
export function getContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Runs a function within a correlation context
 */
export function withCorrelation<T>(
  callback: () => T,
  options?: {
    correlationId?: string;
    userId?: string;
    source?: 'whatsapp' | 'telegram' | 'system';
  }
): T {
  const context: RequestContext = {
    correlationId: options?.correlationId ?? generateCorrelationId(),
    userId: options?.userId,
    source: options?.source,
    startTime: Date.now(),
  };

  return asyncLocalStorage.run(context, callback);
}

/**
 * Runs an async function within a correlation context
 */
export async function withCorrelationAsync<T>(
  callback: () => Promise<T>,
  options?: {
    correlationId?: string;
    userId?: string;
    source?: 'whatsapp' | 'telegram' | 'system';
  }
): Promise<T> {
  const context: RequestContext = {
    correlationId: options?.correlationId ?? generateCorrelationId(),
    userId: options?.userId,
    source: options?.source,
    startTime: Date.now(),
  };

  return asyncLocalStorage.run(context, callback);
}

/**
 * Gets the elapsed time since context started
 */
export function getElapsedTime(): number | undefined {
  const context = asyncLocalStorage.getStore();
  return context ? Date.now() - context.startTime : undefined;
}

export default {
  generate: generateCorrelationId,
  get: getCorrelationId,
  getContext,
  withCorrelation,
  withCorrelationAsync,
  getElapsedTime,
};
