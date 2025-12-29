import { describe, it, expect, beforeEach } from 'vitest';
import metricsService from '../../src/infra/metrics.js';

describe('MetricsService', () => {
  beforeEach(() => {
    // Inicializar métricas se ainda não estiver
    metricsService.initialize();
  });

  describe('initialize', () => {
    it('should initialize without errors', () => {
      expect(() => metricsService.initialize()).not.toThrow();
    });

    it('should be idempotent', () => {
      metricsService.initialize();
      metricsService.initialize();
      // Não deve lançar erro
    });
  });

  describe('recordMessageReceived', () => {
    it('should record message received', () => {
      expect(() => metricsService.recordMessageReceived('text', false)).not.toThrow();
    });

    it('should handle different message types', () => {
      expect(() => metricsService.recordMessageReceived('text', false)).not.toThrow();
      expect(() => metricsService.recordMessageReceived('image', true)).not.toThrow();
      expect(() => metricsService.recordMessageReceived('audio', false)).not.toThrow();
    });
  });

  describe('recordBookingCreated', () => {
    it('should record booking created', () => {
      expect(() => metricsService.recordBookingCreated('recreio')).not.toThrow();
      expect(() => metricsService.recordBookingCreated('bangu')).not.toThrow();
    });
  });

  describe('setActiveSessions', () => {
    it('should set active sessions count', () => {
      expect(() => metricsService.setActiveSessions(10)).not.toThrow();
      expect(() => metricsService.setActiveSessions(0)).not.toThrow();
    });
  });

  describe('startMessageTimer', () => {
    it('should return a function', () => {
      const endTimer = metricsService.startMessageTimer('text');
      expect(typeof endTimer).toBe('function');
    });

    it('should execute end timer without errors', () => {
      const endTimer = metricsService.startMessageTimer('text');
      expect(() => endTimer()).not.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('should return metrics string', async () => {
      const metrics = await metricsService.getMetrics();
      expect(typeof metrics).toBe('string');
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should include custom metrics', async () => {
      metricsService.recordMessageReceived('text', false);
      const metrics = await metricsService.getMetrics();

      expect(metrics).toContain('whatsapp_bot_messages_received_total');
    });

    it('should include default Node.js metrics', async () => {
      const metrics = await metricsService.getMetrics();

      expect(metrics).toContain('nodejs');
    });
  });

  describe('updateMemoryUsage', () => {
    it('should update memory usage metrics', () => {
      expect(() => metricsService.updateMemoryUsage()).not.toThrow();
    });
  });
});
