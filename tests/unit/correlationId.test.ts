import { describe, it, expect } from 'vitest';
import {
  generateCorrelationId,
  getCorrelationId,
  getContext,
  withCorrelation,
  withCorrelationAsync,
  getElapsedTime,
} from '../../src/utils/correlationId.js';

describe('CorrelationId', () => {
  describe('generateCorrelationId', () => {
    it('deve gerar um ID de 8 caracteres', () => {
      const id = generateCorrelationId();

      expect(id).toBeDefined();
      expect(id.length).toBe(8);
    });

    it('deve gerar IDs únicos', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        ids.add(generateCorrelationId());
      }

      expect(ids.size).toBe(100);
    });

    it('deve conter apenas caracteres válidos de UUID', () => {
      const id = generateCorrelationId();

      expect(id).toMatch(/^[a-f0-9]{8}$/);
    });
  });

  describe('getCorrelationId fora de contexto', () => {
    it('deve retornar undefined quando não há contexto', () => {
      expect(getCorrelationId()).toBeUndefined();
    });
  });

  describe('getContext fora de contexto', () => {
    it('deve retornar undefined quando não há contexto', () => {
      expect(getContext()).toBeUndefined();
    });
  });

  describe('withCorrelation', () => {
    it('deve criar contexto com correlationId', () => {
      let capturedId: string | undefined;

      withCorrelation(() => {
        capturedId = getCorrelationId();
      });

      expect(capturedId).toBeDefined();
      expect(capturedId!.length).toBe(8);
    });

    it('deve permitir correlationId personalizado', () => {
      let capturedId: string | undefined;

      withCorrelation(
        () => {
          capturedId = getCorrelationId();
        },
        { correlationId: 'custom12' }
      );

      expect(capturedId).toBe('custom12');
    });

    it('deve incluir userId no contexto', () => {
      let capturedContext: ReturnType<typeof getContext>;

      withCorrelation(
        () => {
          capturedContext = getContext();
        },
        { userId: 'user-123' }
      );

      expect(capturedContext!.userId).toBe('user-123');
    });

    it('deve incluir source no contexto', () => {
      let capturedContext: ReturnType<typeof getContext>;

      withCorrelation(
        () => {
          capturedContext = getContext();
        },
        { source: 'whatsapp' }
      );

      expect(capturedContext!.source).toBe('whatsapp');
    });

    it('deve retornar o valor da callback', () => {
      const result = withCorrelation(() => {
        return 42;
      });

      expect(result).toBe(42);
    });

    it('deve isolar contexto entre chamadas', () => {
      let id1: string | undefined;
      let id2: string | undefined;

      withCorrelation(() => {
        id1 = getCorrelationId();
      });

      withCorrelation(() => {
        id2 = getCorrelationId();
      });

      expect(id1).not.toBe(id2);
    });
  });

  describe('withCorrelationAsync', () => {
    it('deve criar contexto async com correlationId', async () => {
      let capturedId: string | undefined;

      await withCorrelationAsync(async () => {
        // Simular operação async
        await new Promise((resolve) => setTimeout(resolve, 10));
        capturedId = getCorrelationId();
      });

      expect(capturedId).toBeDefined();
      expect(capturedId!.length).toBe(8);
    });

    it('deve manter contexto através de awaits', async () => {
      let id1: string | undefined;
      let id2: string | undefined;

      await withCorrelationAsync(async () => {
        id1 = getCorrelationId();
        await new Promise((resolve) => setTimeout(resolve, 10));
        id2 = getCorrelationId();
      });

      expect(id1).toBe(id2);
    });

    it('deve retornar o valor da callback async', async () => {
      const result = await withCorrelationAsync(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'async-result';
      });

      expect(result).toBe('async-result');
    });
  });

  describe('getElapsedTime', () => {
    it('deve retornar undefined fora de contexto', () => {
      expect(getElapsedTime()).toBeUndefined();
    });

    it('deve retornar tempo decorrido dentro de contexto', async () => {
      let elapsed: number | undefined;

      await withCorrelationAsync(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        elapsed = getElapsedTime();
      });

      expect(elapsed).toBeDefined();
      expect(elapsed!).toBeGreaterThanOrEqual(40); // Margem para variação
    });
  });

  describe('contextos aninhados', () => {
    it('deve manter contexto interno em callbacks aninhadas', () => {
      let outerId: string | undefined;
      let innerId: string | undefined;

      withCorrelation(
        () => {
          outerId = getCorrelationId();

          withCorrelation(
            () => {
              innerId = getCorrelationId();
            },
            { correlationId: 'inner123' }
          );
        },
        { correlationId: 'outer123' }
      );

      expect(outerId).toBe('outer123');
      expect(innerId).toBe('inner123');
    });
  });
});
