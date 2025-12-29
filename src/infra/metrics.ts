import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';
import logger from '../utils/logger.js';

// =============================================================================
// METRICS SERVICE - PROMETHEUS
// =============================================================================
// Coleta e expõe métricas da aplicação para monitoramento com Prometheus.
// Métricas incluem: mensagens, agendamentos, erros, latência, etc.
// =============================================================================

class MetricsService {
  private registry: Registry;
  private isInitialized = false;

  // Contadores
  private messagesReceived!: Counter<string>;
  private messagesProcessed!: Counter<string>;
  private messageErrors!: Counter<string>;
  private bookingsCreated!: Counter<string>;
  private notificationsSent!: Counter<string>;
  private rateLimitHits!: Counter<string>;

  // Gauges
  private activeSessions!: Gauge<string>;
  private pausedChats!: Gauge<string>;
  private queueSize!: Gauge<string>;
  private memoryUsage!: Gauge<string>;

  // Histogramas
  private messageLatency!: Histogram<string>;
  private bookingLatency!: Histogram<string>;
  private notificationLatency!: Histogram<string>;

  constructor() {
    this.registry = new Registry();
  }

  // ===========================================================================
  // INICIALIZAÇÃO
  // ===========================================================================

  initialize(): void {
    if (this.isInitialized) return;

    // Coletar métricas padrão do Node.js
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'whatsapp_bot_',
    });

    // Criar métricas customizadas
    this.createCounters();
    this.createGauges();
    this.createHistograms();

    this.isInitialized = true;
    logger.info('[Metrics] Serviço de métricas inicializado');
  }

  private createCounters(): void {
    this.messagesReceived = new Counter({
      name: 'whatsapp_bot_messages_received_total',
      help: 'Total de mensagens recebidas',
      labelNames: ['type', 'is_group'],
      registers: [this.registry],
    });

    this.messagesProcessed = new Counter({
      name: 'whatsapp_bot_messages_processed_total',
      help: 'Total de mensagens processadas com sucesso',
      labelNames: ['type', 'command'],
      registers: [this.registry],
    });

    this.messageErrors = new Counter({
      name: 'whatsapp_bot_message_errors_total',
      help: 'Total de erros ao processar mensagens',
      labelNames: ['error_type'],
      registers: [this.registry],
    });

    this.bookingsCreated = new Counter({
      name: 'whatsapp_bot_bookings_created_total',
      help: 'Total de agendamentos criados',
      labelNames: ['unit'],
      registers: [this.registry],
    });

    this.notificationsSent = new Counter({
      name: 'whatsapp_bot_notifications_sent_total',
      help: 'Total de notificações enviadas',
      labelNames: ['type', 'status'],
      registers: [this.registry],
    });

    this.rateLimitHits = new Counter({
      name: 'whatsapp_bot_rate_limit_hits_total',
      help: 'Total de vezes que o rate limit foi atingido',
      registers: [this.registry],
    });
  }

  private createGauges(): void {
    this.activeSessions = new Gauge({
      name: 'whatsapp_bot_active_sessions',
      help: 'Número de sessões ativas',
      registers: [this.registry],
    });

    this.pausedChats = new Gauge({
      name: 'whatsapp_bot_paused_chats',
      help: 'Número de chats pausados',
      registers: [this.registry],
    });

    this.queueSize = new Gauge({
      name: 'whatsapp_bot_queue_size',
      help: 'Tamanho da fila de jobs',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.memoryUsage = new Gauge({
      name: 'whatsapp_bot_memory_usage_bytes',
      help: 'Uso de memória em bytes',
      labelNames: ['type'],
      registers: [this.registry],
    });
  }

  private createHistograms(): void {
    this.messageLatency = new Histogram({
      name: 'whatsapp_bot_message_latency_seconds',
      help: 'Latência do processamento de mensagens',
      labelNames: ['type'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.bookingLatency = new Histogram({
      name: 'whatsapp_bot_booking_latency_seconds',
      help: 'Latência do processamento de agendamentos',
      labelNames: ['unit'],
      buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.notificationLatency = new Histogram({
      name: 'whatsapp_bot_notification_latency_seconds',
      help: 'Latência do envio de notificações',
      labelNames: ['type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });
  }

  // ===========================================================================
  // MÉTODOS DE REGISTRO DE MÉTRICAS
  // ===========================================================================

  recordMessageReceived(type: string, isGroup: boolean): void {
    if (!this.isInitialized) return;
    this.messagesReceived.inc({ type, is_group: String(isGroup) });
  }

  recordMessageProcessed(type: string, command?: string): void {
    if (!this.isInitialized) return;
    this.messagesProcessed.inc({ type, command: command ?? 'none' });
  }

  recordMessageError(errorType: string): void {
    if (!this.isInitialized) return;
    this.messageErrors.inc({ error_type: errorType });
  }

  recordBookingCreated(unit: string): void {
    if (!this.isInitialized) return;
    this.bookingsCreated.inc({ unit });
  }

  recordNotificationSent(type: string, status: 'success' | 'failure'): void {
    if (!this.isInitialized) return;
    this.notificationsSent.inc({ type, status });
  }

  recordRateLimitHit(): void {
    if (!this.isInitialized) return;
    this.rateLimitHits.inc();
  }

  setActiveSessions(count: number): void {
    if (!this.isInitialized) return;
    this.activeSessions.set(count);
  }

  setPausedChats(count: number): void {
    if (!this.isInitialized) return;
    this.pausedChats.set(count);
  }

  setQueueSize(queue: string, size: number): void {
    if (!this.isInitialized) return;
    this.queueSize.set({ queue }, size);
  }

  updateMemoryUsage(): void {
    if (!this.isInitialized) return;

    const mem = process.memoryUsage();
    this.memoryUsage.set({ type: 'heapUsed' }, mem.heapUsed);
    this.memoryUsage.set({ type: 'heapTotal' }, mem.heapTotal);
    this.memoryUsage.set({ type: 'rss' }, mem.rss);
    this.memoryUsage.set({ type: 'external' }, mem.external);
  }

  // Histogramas com timers
  startMessageTimer(type: string): () => void {
    if (!this.isInitialized) return () => {};
    return this.messageLatency.startTimer({ type });
  }

  startBookingTimer(unit: string): () => void {
    if (!this.isInitialized) return () => {};
    return this.bookingLatency.startTimer({ unit });
  }

  startNotificationTimer(type: string): () => void {
    if (!this.isInitialized) return () => {};
    return this.notificationLatency.startTimer({ type });
  }

  // ===========================================================================
  // EXPORTAÇÃO
  // ===========================================================================

  async getMetrics(): Promise<string> {
    if (!this.isInitialized) {
      return '# Metrics not initialized\n';
    }

    // Atualizar métricas de memória antes de exportar
    this.updateMemoryUsage();

    return this.registry.metrics();
  }

  async getMetricsJSON(): Promise<object> {
    if (!this.isInitialized) {
      return { error: 'Metrics not initialized' };
    }

    return this.registry.getMetricsAsJSON();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}

// Singleton
const metricsService = new MetricsService();
export default metricsService;
