import 'dotenv/config';
import { whatsappService, telegramService, backupService } from './services/index.js';
import { sqliteService, redisService } from './database/index.js';
import { queueService, healthService, metricsService } from './infra/index.js';
import { handleMessage, getMemoryStats } from './events/index.js';
import { commandLoader } from './commands/index.js';
import { pollHandler } from './handlers/index.js';
import dashboardServer from './dashboard/server.js';
import sessionManager from './utils/sessionManager.js';
import pauseManager from './utils/pauseManager.js';
import logger from './utils/logger.js';
import CONFIG from './config/index.js';

// =============================================================================
// CONFIGURAÇÕES
// =============================================================================

const MAX_CONNECTION_WAIT_MS = 5 * 60 * 1000; // 5 minutos para aguardar conexão
const MEMORY_LOG_INTERVAL_MS = 30 * 60 * 1000; // Log de memória a cada 30 minutos
const CONNECTION_CHECK_INTERVAL_MS = 1000; // Verificar conexão a cada 1 segundo

// =============================================================================
// BOOTSTRAP
// =============================================================================

async function bootstrap(): Promise<void> {
  // Configurar handlers de erro ANTES de qualquer inicialização
  // para capturar erros assíncronos do BullMQ (Redis incompatível)
  setupErrorHandlers();

  logger.info('🚀 Iniciando Bot CT LK Futevôlei v3.0...');
  logger.info(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
  logger.info(`🖥️  Node.js: ${process.version}`);
  logger.info(`💾 PID: ${process.pid}`);

  try {
    // ==========================================================================
    // FASE 1: Inicializar bancos de dados
    // ==========================================================================
    logger.info('📦 Inicializando bancos de dados...');

    // SQLite para agendamentos (sempre necessário)
    await sqliteService.initialize();

    // Redis para sessões (opcional - fallback para memória)
    await redisService.initialize();

    // Migrar dados JSON existentes para SQLite (se houver)
    if (sqliteService.isReady()) {
      await backupService.migrateJSONToSQLite();
    }

    // Sincronizar estado de pausa do Redis
    await pauseManager.syncFromRedis();

    // ==========================================================================
    // FASE 2: Carregar comandos e iniciar serviços
    // ==========================================================================
    await commandLoader.loadCommands();

    // Iniciar serviço WhatsApp
    await whatsappService.start();

    // Registrar handlers de eventos
    const eventEmitter = whatsappService.getEventEmitter();
    eventEmitter.on('messages.upsert', handleMessage);

    // Aguardar conexão com timeout
    await waitForConnection();

    // Iniciar serviço Telegram
    telegramService.start();

    // ==========================================================================
    // FASE 3: Iniciar serviços auxiliares
    // ==========================================================================

    // Iniciar timer de limpeza de sessões
    sessionManager.startCleanupTimer();

    // Iniciar serviço de backup automático
    backupService.start();

    // ==========================================================================
    // FASE 4: Iniciar infraestrutura de escalabilidade
    // ==========================================================================
    logger.info('🔧 Inicializando infraestrutura...');

    // Inicializar métricas
    metricsService.initialize();

    // Inicializar filas (requer Redis)
    await queueService.initialize();
    if (queueService.isReady()) {
      await queueService.setupRecurringJobs();
    }

    // Iniciar servidor de health check
    healthService.start();

    // Iniciar dashboard administrativo
    if (CONFIG.dashboard.enabled) {
      await dashboardServer.start();
      logger.info(`📊 [INFRA] Dashboard: http://localhost:${CONFIG.dashboard.port}`);
    }

    // Iniciar monitoramento de memória
    startMemoryMonitoring();

    // Log de status
    logger.info(`📊 [DB] SQLite: ${sqliteService.isReady() ? 'OK' : 'FALLBACK'}`);
    logger.info(`📊 [DB] Redis: ${redisService.isReady() ? 'OK' : 'FALLBACK (memória)'}`);
    logger.info(`📊 [INFRA] Filas: ${queueService.isReady() ? 'OK' : 'FALLBACK (síncrono)'}`);
    logger.info(`📊 [INFRA] Health: http://localhost:${process.env.HEALTH_PORT ?? 3001}/health`);

    logger.info('✅ Todos os serviços iniciados com sucesso!');

    // Tratamento de encerramento gracioso
    setupGracefulShutdown();

  } catch (error) {
    logger.error('❌ Erro ao iniciar aplicação', error);
    process.exit(1);
  }
}

// =============================================================================
// AGUARDAR CONEXÃO COM TIMEOUT
// =============================================================================

async function waitForConnection(): Promise<void> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let pollsScheduled = false;

    const checkConnection = setInterval(() => {
      const elapsed = Date.now() - startTime;

      if (whatsappService.isConnected() && !pollsScheduled) {
        clearInterval(checkConnection);
        pollsScheduled = true;

        const sock = whatsappService.getSocket();
        if (sock) {
          pollHandler.schedulePolls(sock);
          logger.info(`✅ Conexão estabelecida em ${Math.round(elapsed / 1000)}s`);
        }
        resolve();
        return;
      }

      // Timeout - não conseguiu conectar
      if (elapsed > MAX_CONNECTION_WAIT_MS) {
        clearInterval(checkConnection);
        logger.warn(`⚠️ Timeout aguardando conexão inicial (${MAX_CONNECTION_WAIT_MS / 1000}s)`);
        // Não rejeitar - permitir que o bot continue tentando reconectar
        resolve();
      }
    }, CONNECTION_CHECK_INTERVAL_MS);
  });
}

// =============================================================================
// MONITORAMENTO DE MEMÓRIA
// =============================================================================

function startMemoryMonitoring(): void {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const stats = getMemoryStats();

    logger.info(`📊 [MEMORY] Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB | RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
    logger.info(`📊 [STATS] Chats ativos: ${stats.activeChats} | Mapeamentos: ${stats.jidToLidMappings} | Rate limits: ${stats.rateLimits}`);
  }, MEMORY_LOG_INTERVAL_MS);
}

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

function setupGracefulShutdown(): void {
  let isShuttingDown = false;

  const gracefulShutdown = async (signal: string): Promise<void> => {
    // Evitar múltiplas chamadas
    if (isShuttingDown) {
      logger.warn(`⚠️ Shutdown já em andamento, ignorando ${signal}`);
      return;
    }
    isShuttingDown = true;

    logger.info(`⏹️ Recebido ${signal}, encerrando aplicação...`);

    // Timeout para forçar encerramento se demorar muito
    const forceExitTimeout = setTimeout(() => {
      logger.error('⚠️ Timeout no graceful shutdown, forçando encerramento');
      process.exit(1);
    }, 30000); // 30 segundos

    try {
      // Parar serviços na ordem inversa
      await dashboardServer.stop();
      healthService.stop();
      await queueService.close();
      backupService.stop();
      sessionManager.stopCleanupTimer();
      telegramService.stop();
      await whatsappService.stop();

      // Fechar conexões de banco
      await redisService.close();
      sqliteService.close();

      clearTimeout(forceExitTimeout);
      logger.info('👋 Aplicação encerrada com sucesso');
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimeout);
      logger.error('Erro ao encerrar aplicação', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

// =============================================================================
// TRATAMENTO DE ERROS NÃO CAPTURADOS
// =============================================================================

function setupErrorHandlers(): void {
  // uncaughtException - erro síncrono não capturado
  // DEVE encerrar o processo pois o estado da aplicação pode estar corrompido
  process.on('uncaughtException', (error: Error) => {
    // Ignorar erros de versão do Redis (BullMQ requer Redis 5.0+)
    if (error.message.includes('Redis version')) {
      logger.warn('⚠️ [Queue] Erro de versão do Redis ignorado - filas desabilitadas');
      return;
    }

    logger.error('💀 [FATAL] Erro não capturado - encerrando processo', error);

    // Dar um pequeno delay para o log ser escrito
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // unhandledRejection - promise rejeitada sem catch
  // Pode ser recuperável, mas é melhor encerrar para evitar comportamento indefinido
  process.on('unhandledRejection', (reason: unknown) => {
    // Ignorar erros de versão do Redis (BullMQ requer Redis 5.0+)
    // Esses erros são esperados quando o usuário tem versão antiga do Redis
    const errorMessage = reason instanceof Error ? reason.message : String(reason);
    if (errorMessage.includes('Redis version')) {
      logger.warn('⚠️ [Queue] Erro de versão do Redis ignorado - filas desabilitadas');
      return;
    }

    logger.error('💀 [FATAL] Promise rejeitada não tratada', reason);

    // Converter para uncaughtException para garantir encerramento
    throw reason instanceof Error ? reason : new Error(String(reason));
  });

  // Aviso de deprecation
  process.on('warning', (warning) => {
    logger.warn(`⚠️ [WARNING] ${warning.name}: ${warning.message}`);
  });
}

// =============================================================================
// INICIAR APLICAÇÃO
// =============================================================================

bootstrap();
