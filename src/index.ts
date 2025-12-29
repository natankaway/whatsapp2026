import 'dotenv/config';
import { whatsappService, telegramService } from './services/index.js';
import { handleMessage } from './events/index.js';
import { commandLoader } from './commands/index.js';
import { pollHandler } from './handlers/index.js';
import logger from './utils/logger.js';

async function bootstrap(): Promise<void> {
  logger.info('🚀 Iniciando Bot CT LK Futevôlei v3.0...');

  try {
    // Carregar comandos
    await commandLoader.loadCommands();

    // Iniciar serviço WhatsApp
    await whatsappService.start();

    // Registrar handlers de eventos
    const eventEmitter = whatsappService.getEventEmitter();
    eventEmitter.on('messages.upsert', handleMessage);

    // Aguardar conexão e configurar enquetes
    const checkConnection = setInterval(() => {
      if (whatsappService.isConnected()) {
        clearInterval(checkConnection);
        const sock = whatsappService.getSocket();
        if (sock) {
          pollHandler.schedulePolls(sock);
        }
      }
    }, 1000);

    // Iniciar serviço Telegram
    telegramService.start();

    logger.info('✅ Todos os serviços iniciados com sucesso!');

    // Tratamento de encerramento gracioso
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`⏹️ Recebido ${signal}, encerrando aplicação...`);

      try {
        await whatsappService.stop();
        telegramService.stop();
        logger.info('👋 Aplicação encerrada com sucesso');
        process.exit(0);
      } catch (error) {
        logger.error('Erro ao encerrar aplicação', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Tratamento de erros não capturados
    process.on('uncaughtException', (error) => {
      logger.error('Erro não capturado', error);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Promise rejeitada não tratada', reason);
    });
  } catch (error) {
    logger.error('❌ Erro ao iniciar aplicação', error);
    process.exit(1);
  }
}

bootstrap();
