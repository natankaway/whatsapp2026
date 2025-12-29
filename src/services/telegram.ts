import TelegramBot from 'node-telegram-bot-api';
import CONFIG from '../config/index.js';
import logger from '../utils/logger.js';
import storage from '../utils/storage.js';
import type { AgendaData } from '../types/index.js';

class TelegramService {
  private recreioBot: TelegramBot | null = null;
  private banguBot: TelegramBot | null = null;

  /**
   * Verifica se o usuário está autorizado a executar comandos
   */
  private isAuthorized(userId: number): boolean {
    const authorizedIds = CONFIG.telegram.authorizedUserIds;
    // Se não há IDs configurados, permite todos (modo legacy)
    if (authorizedIds.length === 0) {
      return true;
    }
    return authorizedIds.includes(userId);
  }

  start(): void {
    try {
      if (CONFIG.telegram.recreioToken) {
        this.recreioBot = new TelegramBot(CONFIG.telegram.recreioToken, { polling: true });
        this.setupHandlers(this.recreioBot, 'recreio');
        logger.info('🤖 Bot Telegram Recreio iniciado');
      }

      if (CONFIG.telegram.banguToken) {
        this.banguBot = new TelegramBot(CONFIG.telegram.banguToken, { polling: true });
        this.setupHandlers(this.banguBot, 'bangu');
        logger.info('🤖 Bot Telegram Bangu iniciado');
      }
    } catch (error) {
      logger.error('Falha ao iniciar bots do Telegram', error);
    }
  }

  private setupHandlers(bot: TelegramBot, botType: 'recreio' | 'bangu'): void {
    bot.on('message', (msg) => {
      if (msg.text?.startsWith('/')) {
        this.handleCommand(bot, msg, botType);
      }
    });

    // Silenciar erros de polling (não afeta funcionamento)
    bot.on('polling_error', () => {
      // Ignorar silenciosamente - conflitos de polling não afetam o bot
    });

    bot.on('error', () => {
      // Ignorar erros gerais silenciosamente
    });
  }

  private parseDate(dateStr: string): string | null {
    const parts = dateStr.split('/');
    if (parts.length !== 2) return null;

    const day = (parts[0] ?? '').padStart(2, '0');
    const month = (parts[1] ?? '').padStart(2, '0');
    const year = new Date().getFullYear();

    return `${year}-${month}-${day}`;
  }

  private async handleCommand(
    bot: TelegramBot,
    msg: TelegramBot.Message,
    botType: 'recreio' | 'bangu'
  ): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const userName = msg.from?.username ?? msg.from?.first_name ?? 'Desconhecido';
    const text = msg.text ?? '';
    const parts = text.split(' ');
    const command = parts[0];
    const dateStr = parts[1] ?? '';
    const timeStr = parts[2] ?? '';
    const nameParts = parts.slice(3);

    const filePath = CONFIG.jsonFilePaths[botType];

    // Verificar autorização (exceto /start e /help)
    if (command !== '/start' && command !== '/help') {
      if (!userId || !this.isAuthorized(userId)) {
        logger.warn('Tentativa de acesso não autorizado ao Telegram', {
          userId,
          userName,
          command,
          chatId,
        });
        await bot.sendMessage(
          chatId,
          '⛔ *Acesso Negado*\n\n' +
            'Você não está autorizado a executar comandos administrativos.\n' +
            `Seu ID: \`${userId}\`\n\n` +
            'Solicite autorização ao administrador.',
          { parse_mode: 'Markdown' }
        );
        return;
      }
    }

    if (command === '/start' || command === '/help') {
      await bot.sendMessage(
        chatId,
        `📋 *Comandos disponíveis:*\n\n` +
          `/add DD/MM HH:mm Nome - Adicionar agendamento\n` +
          `/cancel DD/MM HH:mm Nome - Cancelar agendamento\n` +
          `/status DD/MM [HH:mm] - Ver status do dia\n` +
          `/backup - Criar backup da agenda`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (command === '/backup') {
      try {
        const backupPath = await storage.backup(botType);
        await bot.sendMessage(chatId, `✅ Backup criado: ${backupPath}`);
      } catch {
        await bot.sendMessage(chatId, '❌ Erro ao criar backup');
      }
      return;
    }

    if (!dateStr || (command !== '/status' && (!timeStr || nameParts.length === 0))) {
      await bot.sendMessage(
        chatId,
        'Formato inválido. Use:\n' +
          '/add DD/MM HH:mm Nome\n' +
          '/cancel DD/MM HH:mm Nome\n' +
          '/status DD/MM [HH:mm]'
      );
      return;
    }

    const dateISO = this.parseDate(dateStr);
    if (!dateISO) {
      await bot.sendMessage(chatId, 'Data inválida. Use o formato DD/MM.');
      return;
    }

    const agenda = await storage.readAgenda(filePath);
    if (!agenda[dateISO]) {
      agenda[dateISO] = {};
    }

    switch (command) {
      case '/add':
        await this.handleAdd(bot, chatId, agenda, dateISO, timeStr, nameParts, filePath, botType);
        break;
      case '/cancel':
        await this.handleCancel(bot, chatId, agenda, dateISO, timeStr, nameParts, filePath);
        break;
      case '/status':
        await this.handleStatus(bot, chatId, agenda, dateISO, timeStr, botType);
        break;
      default:
        await bot.sendMessage(chatId, 'Comando não reconhecido.');
    }
  }

  private async handleAdd(
    bot: TelegramBot,
    chatId: number,
    agenda: AgendaData,
    dateISO: string,
    timeKey: string,
    nameParts: string[],
    filePath: string,
    botType: 'recreio' | 'bangu'
  ): Promise<void> {
    const name = nameParts.join(' ');
    const [mainName, companionName] = name.includes('+')
      ? name.split('+').map((n) => n.trim())
      : [name, null];
    const spotsNeeded = companionName ? 2 : 1;

    if (!agenda[dateISO]?.[timeKey]) {
      agenda[dateISO] = agenda[dateISO] ?? {};
      agenda[dateISO][timeKey] = [];
    }

    const currentSpots = agenda[dateISO][timeKey]?.length ?? 0;

    if (botType === 'recreio' && currentSpots + spotsNeeded > 2) {
      await bot.sendMessage(
        chatId,
        `❌ Erro! Não há vagas suficientes. Vagas ocupadas: ${currentSpots}/2.`
      );
      return;
    }

    agenda[dateISO][timeKey]?.push({ name: mainName ?? '' });
    if (companionName) {
      agenda[dateISO][timeKey]?.push({ name: `${companionName} (Acompanhante)` });
    }

    await storage.writeAgenda(filePath, agenda);
    const formattedDate = dateISO.split('-').slice(1).reverse().join('/');
    await bot.sendMessage(
      chatId,
      `✅ Agendamento adicionado para ${mainName}${companionName ? ' + ' + companionName : ''} em ${formattedDate} às ${timeKey}.`
    );
  }

  private async handleCancel(
    bot: TelegramBot,
    chatId: number,
    agenda: AgendaData,
    dateISO: string,
    timeKey: string,
    nameParts: string[],
    filePath: string
  ): Promise<void> {
    const name = nameParts.join(' ');

    if (!agenda[dateISO]?.[timeKey]) {
      await bot.sendMessage(chatId, `⚠️ Nenhum agendamento encontrado para esse horário.`);
      return;
    }

    const initialLength = agenda[dateISO][timeKey]?.length ?? 0;
    agenda[dateISO][timeKey] =
      agenda[dateISO][timeKey]?.filter(
        (p) => !p.name.toLowerCase().includes(name.toLowerCase())
      ) ?? [];

    if ((agenda[dateISO][timeKey]?.length ?? 0) < initialLength) {
      await storage.writeAgenda(filePath, agenda);
      await bot.sendMessage(chatId, `✅ Agendamento para "${name}" cancelado com sucesso.`);
    } else {
      await bot.sendMessage(chatId, `⚠️ Aluno "${name}" não encontrado nesse horário.`);
    }
  }

  private async handleStatus(
    bot: TelegramBot,
    chatId: number,
    agenda: AgendaData,
    dateISO: string,
    timeParam: string | undefined,
    botType: 'recreio' | 'bangu'
  ): Promise<void> {
    const dayData = agenda[dateISO];

    if (!dayData || Object.keys(dayData).length === 0) {
      await bot.sendMessage(chatId, `📅 Nenhum agendamento para ${dateISO.split('-').slice(1).reverse().join('/')}.`);
      return;
    }

    let message = `📅 *Status - ${dateISO.split('-').slice(1).reverse().join('/')}*\n\n`;

    const times = timeParam ? [timeParam] : Object.keys(dayData).sort();

    for (const time of times) {
      const entries = dayData[time];
      if (!entries) continue;

      const maxSpots = botType === 'recreio' ? 2 : 6;
      message += `⏰ *${time}* (${entries.length}/${maxSpots})\n`;

      for (const entry of entries) {
        message += `  • ${entry.name}\n`;
      }
      message += '\n';
    }

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  stop(): void {
    if (this.recreioBot) {
      this.recreioBot.stopPolling();
      logger.info('Bot Telegram Recreio parado');
    }
    if (this.banguBot) {
      this.banguBot.stopPolling();
      logger.info('Bot Telegram Bangu parado');
    }
  }
}

// Singleton
const telegramService = new TelegramService();
export default telegramService;
