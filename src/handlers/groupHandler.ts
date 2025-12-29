import type { WhatsAppSocket, Message } from '../types/index.js';
import CONFIG from '../config/index.js';
import { sendText, sendTextWithMentions } from '../utils/messageHelpers.js';
import logger from '../utils/logger.js';
import { pollHandler } from './pollHandler.js';

class GroupHandler {
  async handleGroupMessage(
    sock: WhatsAppSocket,
    from: string,
    text: string,
    _message: Message
  ): Promise<void> {
    const lowerText = text.toLowerCase().trim();

    // Log do ID do grupo
    if (lowerText.includes('@bot') || lowerText === 'ajuda') {
      logger.debug(`ID do Grupo: ${from}`);
    }

    // Comandos de enquete manual
    if (await pollHandler.handleManualPollCommand(sock, from, lowerText)) {
      return;
    }

    // Outros comandos do grupo
    if (lowerText.includes('@bot') || lowerText === 'ajuda') {
      await this.handleBotCommand(sock, from, lowerText);
    }
  }

  private async handleBotCommand(
    sock: WhatsAppSocket,
    from: string,
    command: string
  ): Promise<void> {
    if (command.includes('unidades')) {
      await this.sendUnitsInfo(sock, from);
    } else if (command.includes('horarios') || command.includes('horários')) {
      await this.sendAllSchedules(sock, from);
    } else if (command.includes('valores') || command.includes('preços') || command.includes('precos')) {
      await this.sendAllPrices(sock, from);
    } else if (command.includes('recreio')) {
      await this.sendUnitDetails(sock, from, 0);
    } else if (command.includes('bangu')) {
      await this.sendUnitDetails(sock, from, 1);
    } else if (command.includes('experimental')) {
      await this.sendExperimentalInfo(sock, from);
    } else if (command.includes('plataformas')) {
      await this.sendPlatformsInfo(sock, from);
    } else {
      await this.sendGroupHelp(sock, from);
    }
  }

  async handleParticipantUpdate(
    sock: WhatsAppSocket,
    update: { id: string; participants: string[]; action: string }
  ): Promise<void> {
    const { id, participants, action } = update;

    if (action === 'add') {
      for (const participant of participants) {
        const username = participant.split('@')[0] ?? '';
        await sendTextWithMentions(
          sock,
          id,
          `⚽ Bem-vindo(a) ao grupo do CT LK Futevôlei, @${username}! 🏐⚡`,
          [participant]
        );
        logger.info(`Novo membro no grupo ${id}: ${participant}`);
      }
    }
  }

  private async sendGroupHelp(sock: WhatsAppSocket, from: string): Promise<void> {
    await sendText(
      sock,
      from,
      `🏐 *Comandos CT LK Futevôlei no Grupo:*\n\n` +
        `• @bot unidades - Informações das unidades\n` +
        `• @bot horarios - Horários das aulas\n` +
        `• @bot valores - Preços e planos\n` +
        `• @bot recreio - Info da unidade Recreio\n` +
        `• @bot bangu - Info da unidade Bangu\n` +
        `• @bot experimental - Agendar aula experimental\n` +
        `• @bot plataformas - Apps de check-in aceitos\n\n` +
        `📊 *Comandos de Enquete (Admin):*\n` +
        `• @bot enquete recreio - Criar enquete Recreio\n` +
        `• @bot enquete bangu - Criar enquete Bangu\n` +
        `• @bot enquete sabado - Criar enquete aulão`
    );
  }

  private async sendUnitsInfo(sock: WhatsAppSocket, from: string): Promise<void> {
    let message = `⚽ *NOSSAS UNIDADES* 🏐\n\n`;

    CONFIG.unidades.forEach((unidade) => {
      message += `📍 *${unidade.nome}*\n`;
      message += `${unidade.endereco}\n\n`;
    });

    await sendText(sock, from, message);
  }

  private async sendAllSchedules(sock: WhatsAppSocket, from: string): Promise<void> {
    let message = `⏰ *HORÁRIOS DAS AULAS* ⏰\n`;

    CONFIG.unidades.forEach((unidade) => {
      message += `\n📍 *${unidade.nome}*\n`;
      message += `━━━━━━━━━━━━━━━\n`;

      if (unidade.horariosTexto) {
        unidade.horariosTexto.forEach((h) => (message += `${h}\n`));
      } else {
        unidade.horarios.forEach((h) => (message += `${h}\n`));
      }
    });

    await sendText(sock, from, message);
  }

  private async sendAllPrices(sock: WhatsAppSocket, from: string): Promise<void> {
    let message = `💰 *VALORES* 💰\n`;

    CONFIG.unidades.forEach((unidade) => {
      message += `\n📍 *${unidade.nome}*\n`;
      unidade.precos.mensalidade.forEach((plano) => {
        message += `• ${plano.frequencia}: ${plano.valor}\n`;
      });
      message += `• Avulsa: ${unidade.precos.avulsa}\n`;
    });

    await sendText(sock, from, message);
  }

  private async sendUnitDetails(
    sock: WhatsAppSocket,
    from: string,
    unitIndex: number
  ): Promise<void> {
    const unidade = CONFIG.unidades[unitIndex];
    if (!unidade) return;

    let message = `⚽ *${unidade.nome}* 🏐\n\n`;
    message += `📍 ${unidade.endereco}\n\n`;
    message += `📅 ${unidade.diasFuncionamento}\n\n`;

    if (unidade.horariosTexto) {
      unidade.horariosTexto.forEach((h) => (message += `${h}\n`));
    } else {
      unidade.horarios.forEach((h) => (message += `• ${h}\n`));
    }

    await sendText(sock, from, message);
  }

  private async sendExperimentalInfo(sock: WhatsAppSocket, from: string): Promise<void> {
    await sendText(
      sock,
      from,
      `🎯 *AULA EXPERIMENTAL GRATUITA* 🎯\n\n` +
        `Para agendar sua aula experimental:\n\n` +
        `1️⃣ Envie uma mensagem privada para este número\n` +
        `2️⃣ Digite *4* no menu principal\n` +
        `3️⃣ Siga as instruções de agendamento\n\n` +
        `✨ Primeira aula 100% gratuita!`
    );
  }

  private async sendPlatformsInfo(sock: WhatsAppSocket, from: string): Promise<void> {
    await sendText(
      sock,
      from,
      `📱 *PLATAFORMAS ACEITAS* 📱\n\n` +
        `• Wellhub (Gympass) - Plano Silver+\n` +
        `• TotalPass - Plano TP2+\n` +
        `• GuruPass - 35 créditos\n\n` +
        `⚠️ Faça check-in antes da aula!`
    );
  }
}

export const groupHandler = new GroupHandler();
