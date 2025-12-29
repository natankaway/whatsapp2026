import type { Middleware, MiddlewareContext, MiddlewareNext } from '../types/index.js';
import CONFIG from '../config/index.js';
import logger from '../utils/logger.js';
import { sendText } from '../utils/messageHelpers.js';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimits: Map<string, RateLimitEntry> = new Map();

export const rateLimitMiddleware: Middleware = async (
  ctx: MiddlewareContext,
  next: MiddlewareNext
): Promise<void> => {
  const { from } = ctx;
  const now = Date.now();
  const entry = rateLimits.get(from);

  if (entry) {
    if (now > entry.resetTime) {
      // Resetar contador
      rateLimits.set(from, {
        count: 1,
        resetTime: now + CONFIG.rateLimit.windowMs,
      });
    } else if (entry.count >= CONFIG.rateLimit.maxRequests) {
      // Limite atingido
      logger.warn(`Rate limit atingido para ${from}`);
      await sendText(
        ctx.sock,
        from,
        '⚠️ Você está enviando muitas mensagens. Aguarde um momento e tente novamente.'
      );
      return;
    } else {
      // Incrementar contador
      entry.count++;
    }
  } else {
    // Primeira mensagem
    rateLimits.set(from, {
      count: 1,
      resetTime: now + CONFIG.rateLimit.windowMs,
    });
  }

  await next();
};

// Limpar entradas antigas periodicamente
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits.entries()) {
    if (now > entry.resetTime) {
      rateLimits.delete(key);
    }
  }
}, 60000);
