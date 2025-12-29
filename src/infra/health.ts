import http from 'http';
import { sqliteService, redisService } from '../database/index.js';
import { whatsappService } from '../services/index.js';
import queueService from './queue.js';
import metricsService from './metrics.js';
import logger from '../utils/logger.js';

// =============================================================================
// HEALTH CHECK SERVICE
// =============================================================================
// Expõe endpoints HTTP para verificação de saúde da aplicação.
// Usado por orquestradores (Docker, K8s) e load balancers.
// =============================================================================

const HEALTH_PORT = parseInt(process.env.HEALTH_PORT ?? '3000');

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    whatsapp: ComponentHealth;
    sqlite: ComponentHealth;
    redis: ComponentHealth;
    queue: ComponentHealth;
  };
}

interface ComponentHealth {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  message?: string;
}

class HealthService {
  private server: http.Server | null = null;
  private startTime: number = Date.now();

  // ===========================================================================
  // INICIALIZAÇÃO
  // ===========================================================================

  start(): void {
    this.server = http.createServer(async (req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');

      try {
        switch (req.url) {
          case '/health':
          case '/healthz':
            await this.handleHealth(res);
            break;

          case '/ready':
          case '/readiness':
            await this.handleReady(res);
            break;

          case '/live':
          case '/liveness':
            this.handleLive(res);
            break;

          case '/metrics':
            await this.handleMetrics(res);
            break;

          default:
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (error) {
        logger.error('[Health] Erro ao processar requisição', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });

    this.server.listen(HEALTH_PORT, () => {
      logger.info(`[Health] Servidor de health check iniciado na porta ${HEALTH_PORT}`);
    });

    this.server.on('error', (error) => {
      logger.error('[Health] Erro no servidor de health check', error);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      logger.info('[Health] Servidor de health check encerrado');
    }
  }

  // ===========================================================================
  // ENDPOINTS
  // ===========================================================================

  /**
   * /health - Status completo de saúde
   * Retorna 200 se saudável, 503 se não saudável
   */
  private async handleHealth(res: http.ServerResponse): Promise<void> {
    const health = await this.getHealthStatus();

    const statusCode = health.status === 'healthy' ? 200 :
                       health.status === 'degraded' ? 200 : 503;

    res.writeHead(statusCode);
    res.end(JSON.stringify(health, null, 2));
  }

  /**
   * /ready - Verifica se a aplicação está pronta para receber tráfego
   * Usado por K8s readiness probe
   */
  private async handleReady(res: http.ServerResponse): Promise<void> {
    const isReady = whatsappService.isConnected() && sqliteService.isReady();

    if (isReady) {
      res.writeHead(200);
      res.end(JSON.stringify({ ready: true }));
    } else {
      res.writeHead(503);
      res.end(JSON.stringify({
        ready: false,
        whatsapp: whatsappService.isConnected(),
        sqlite: sqliteService.isReady(),
      }));
    }
  }

  /**
   * /live - Verifica se a aplicação está viva
   * Usado por K8s liveness probe
   */
  private handleLive(res: http.ServerResponse): void {
    res.writeHead(200);
    res.end(JSON.stringify({
      alive: true,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    }));
  }

  /**
   * /metrics - Métricas para Prometheus
   */
  private async handleMetrics(res: http.ServerResponse): Promise<void> {
    try {
      const metrics = await metricsService.getMetrics();

      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.writeHead(200);
      res.end(metrics);
    } catch {
      res.writeHead(500);
      res.end('# Error collecting metrics\n');
    }
  }

  // ===========================================================================
  // VERIFICAÇÕES DE SAÚDE
  // ===========================================================================

  async getHealthStatus(): Promise<HealthStatus> {
    const [whatsapp, sqlite, redis, queue] = await Promise.all([
      this.checkWhatsApp(),
      this.checkSQLite(),
      this.checkRedis(),
      this.checkQueue(),
    ]);

    // Determinar status geral
    const statuses = [whatsapp.status, sqlite.status, redis.status, queue.status];
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (statuses.includes('down')) {
      // WhatsApp ou SQLite down = unhealthy
      if (whatsapp.status === 'down' || sqlite.status === 'down') {
        overallStatus = 'unhealthy';
      } else {
        // Redis ou Queue down = degraded
        overallStatus = 'degraded';
      }
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version ?? '3.0.0',
      checks: {
        whatsapp,
        sqlite,
        redis,
        queue,
      },
    };
  }

  private async checkWhatsApp(): Promise<ComponentHealth> {
    const start = Date.now();
    const isConnected = whatsappService.isConnected();
    const latency = Date.now() - start;

    return {
      status: isConnected ? 'up' : 'down',
      latency,
      message: isConnected ? 'Conectado ao WhatsApp' : 'Desconectado do WhatsApp',
    };
  }

  private async checkSQLite(): Promise<ComponentHealth> {
    const start = Date.now();
    const isReady = sqliteService.isReady();
    const latency = Date.now() - start;

    return {
      status: isReady ? 'up' : 'down',
      latency,
      message: isReady ? 'Banco SQLite operacional' : 'Banco SQLite indisponível',
    };
  }

  private async checkRedis(): Promise<ComponentHealth> {
    const start = Date.now();
    const isReady = redisService.isReady();
    const latency = Date.now() - start;

    return {
      status: isReady ? 'up' : 'degraded',
      latency,
      message: isReady ? 'Redis conectado' : 'Redis indisponível (usando memória)',
    };
  }

  private async checkQueue(): Promise<ComponentHealth> {
    const start = Date.now();
    const isReady = queueService.isReady();
    const latency = Date.now() - start;

    if (!isReady) {
      return {
        status: 'degraded',
        latency,
        message: 'Filas indisponíveis (processamento síncrono)',
      };
    }

    const stats = await queueService.getStats();
    return {
      status: 'up',
      latency,
      message: `Filas ativas - Notificações: ${stats?.notifications.waiting ?? 0} pendentes`,
    };
  }
}

// Singleton
const healthService = new HealthService();
export default healthService;
