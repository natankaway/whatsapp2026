import { describe, it, expect, vi } from 'vitest';

// Mock todas as dependências
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation((name) => ({
    name,
    add: vi.fn(() => Promise.resolve({ id: 'job-1' })),
    getWaitingCount: vi.fn(() => Promise.resolve(0)),
    getActiveCount: vi.fn(() => Promise.resolve(0)),
    getCompletedCount: vi.fn(() => Promise.resolve(0)),
    getFailedCount: vi.fn(() => Promise.resolve(0)),
    close: vi.fn(() => Promise.resolve()),
    obliterate: vi.fn(() => Promise.resolve()),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('../../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/services/notification.js', () => ({
  default: {
    sendTelegramNotification: vi.fn(() => Promise.resolve([{ success: true }])),
  },
}));

vi.mock('../../src/services/backup.js', () => ({
  default: {
    runBackup: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('../../src/utils/sessionManager.js', () => ({
  default: {
    cleanupExpiredSessions: vi.fn(),
  },
}));

vi.mock('../../src/infra/metrics.js', () => ({
  default: {
    incrementJobsProcessed: vi.fn(),
    incrementJobsFailed: vi.fn(),
    recordMessageLatency: vi.fn(),
    recordMessageError: vi.fn(),
  },
}));

describe('QueueService', () => {
  it('deve exportar queueService com métodos corretos', async () => {
    const { default: queueService } = await import('../../src/infra/queue.js');

    expect(queueService).toBeDefined();
    expect(typeof queueService.addNotification).toBe('function');
    expect(typeof queueService.scheduleBackup).toBe('function');
    expect(typeof queueService.scheduleCleanup).toBe('function');
    expect(typeof queueService.getStats).toBe('function');
    expect(typeof queueService.close).toBe('function');
    expect(typeof queueService.isReady).toBe('function');
  });
});
