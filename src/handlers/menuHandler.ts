import type { WhatsAppSocket, UserSession } from '../types/index.js';
import CONFIG from '../config/index.js';
import sessionManager from '../utils/sessionManager.js';
import { sendText } from '../utils/messageHelpers.js';
import { bookingHandler } from './bookingHandler.js';
import pauseManager from '../utils/pauseManager.js';
import { sqliteService } from '../database/index.js';

// Interface para unidade no formato usado pelo handler
interface UnidadeConfig {
  id: number;
  nome: string;
  endereco: string;
  local: string;
  diasFuncionamento: string;
  horarios: string[];
  horariosTexto?: string[];
  aulaoSabado?: string;
  precos: {
    mensalidade: Array<{ frequencia: string; valor: string }>;
    avulsa: string;
  };
  plataformas: string[];
}

// Função que busca unidades do banco de dados (com fallback para CONFIG)
function getUnidades(): UnidadeConfig[] {
  try {
    const dbUnits = sqliteService.getUnits();
    if (dbUnits && dbUnits.length > 0) {
      return dbUnits.map((u, index) => ({
        id: u.id ?? index + 1,
        nome: u.name,
        endereco: u.address,
        local: u.location,
        diasFuncionamento: u.workingDays,
        horarios: u.schedules || [],
        horariosTexto: u.schedulesText,
        aulaoSabado: u.saturdayClass,
        precos: {
          mensalidade: u.prices?.mensalidade || [],
          avulsa: u.prices?.avulsa || 'R$ 30,00',
        },
        plataformas: u.platforms || [],
      }));
    }
  } catch {
    // Fallback silencioso para CONFIG se DB falhar
  }
  return CONFIG.unidades;
}

class MenuHandler {
  async handleMenuOption(
    sock: WhatsAppSocket,
    from: string,
    text: string,
    _session: UserSession
  ): Promise<void> {
    switch (text) {
      case '1':
        sessionManager.setState(from, 'units');
        await this.sendUnitsMenu(sock, from);
        break;
      case '2':
        await this.sendAllSchedules(sock, from);
        break;
      case '3':
        sessionManager.setState(from, 'prices');
        await this.sendPricesMenu(sock, from);
        break;
      case '4':
        sessionManager.setState(from, 'experimental_unit');
        await bookingHandler.sendExperimentalUnitSelection(sock, from);
        break;
      case '5':
        await this.sendPlatformsInfo(sock, from);
        break;
      case '6':
        await this.sendLocations(sock, from);
        break;
      case '7':
        await this.sendLevelsInfo(sock, from);
        break;
      case '8':
        sessionManager.setState(from, 'faq');
        await this.sendFAQMenu(sock, from);
        break;
      case '9':
        await this.connectToAgent(sock, from);
        sessionManager.setState(from, 'waiting_message');
        break;
      default:
        await sendText(
          sock,
          from,
          `❌ Opção inválida. Por favor, escolha uma opção de 1 a 9.\n\n${CONFIG.menuPrincipal}`
        );
    }
  }

  async sendUnitsMenu(sock: WhatsAppSocket, from: string): Promise<void> {
    const unidades = getUnidades();
    let message = `⚽ *NOSSAS UNIDADES CT LK FUTEVÔLEI* 🏐\n\n`;

    unidades.forEach((unidade, index) => {
      message += `${index + 1}️⃣ *${unidade.nome}*\n   📍 ${unidade.local}\n\n`;
    });

    message += `Digite o número da unidade para mais informações ou *MENU* para voltar.`;

    await sendText(sock, from, message);
  }

  async handleUnitsOption(
    sock: WhatsAppSocket,
    from: string,
    text: string,
    _session: UserSession
  ): Promise<void> {
    const unidades = getUnidades();
    const unitIndex = parseInt(text) - 1;

    if (unitIndex >= 0 && unitIndex < unidades.length) {
      await this.sendUnitDetails(sock, from, unitIndex);
      sessionManager.setState(from, 'menu');
    } else {
      await sendText(sock, from, `❌ Opção inválida. Por favor, escolha 1 ou 2.`);
    }
  }

  async sendUnitDetails(sock: WhatsAppSocket, from: string, unitIndex: number): Promise<void> {
    const unidades = getUnidades();
    const unidade = unidades[unitIndex];
    if (!unidade) return;

    let message = `⚽ *${unidade.nome}* 🏐\n\n`;
    message += `📍 *Endereço:*\n${unidade.endereco}\n\n`;
    message += `📅 *Dias de Funcionamento:*\n${unidade.diasFuncionamento}\n\n`;
    message += `⏰ *Horários das Aulas:*\n`;

    if (unidade.horariosTexto) {
      unidade.horariosTexto.forEach((h) => (message += `${h}\n`));
    } else {
      unidade.horarios.forEach((h) => (message += `• ${h}\n`));
    }

    if (unidade.aulaoSabado) {
      message += `\n🎉 *Especial:* ${unidade.aulaoSabado}\n`;
    }

    message += `\n💳 *Formas de Pagamento:*\n`;
    message += `• Wellhub (plano Silver+)\n• TotalPass (plano TP2+)\n• GuruPass (35 créditos)\n`;
    message += `• Mensalidades e avulsas\n\n`;
    message += `Digite *3* para ver os valores ou *MENU* para voltar.`;

    await sendText(sock, from, message);
  }

  async sendAllSchedules(sock: WhatsAppSocket, from: string): Promise<void> {
    const unidades = getUnidades();
    let message = `⏰ *HORÁRIOS DAS AULAS* ⏰\n`;

    unidades.forEach((unidade) => {
      message += `\n📍 *${unidade.nome}*\n`;
      message += `📅 ${unidade.diasFuncionamento}\n`;
      message += `━━━━━━━━━━━━━━━\n`;

      if (unidade.horariosTexto) {
        unidade.horariosTexto.forEach((h) => (message += `${h}\n`));
      } else {
        unidade.horarios.forEach((h) => (message += `${h}\n`));
      }

      if (unidade.aulaoSabado) {
        message += `\n${unidade.aulaoSabado}\n`;
      }
    });

    message += `\n💡 Chegue 10 min antes do horário!\n\n`;
    message += `Digite *MENU* para voltar.`;

    await sendText(sock, from, message);
  }

  async sendPricesMenu(sock: WhatsAppSocket, from: string): Promise<void> {
    let message = `💰 *VALORES E PLANOS* 💰\n\n`;
    message += `Escolha a unidade:\n\n`;
    message += `1️⃣ Recreio\n`;
    message += `2️⃣ Califórnia (Bangu)\n`;
    message += `3️⃣ Ver todos os valores\n\n`;
    message += `Digite o número ou *MENU* para voltar.`;

    await sendText(sock, from, message);
  }

  async handlePricesOption(
    sock: WhatsAppSocket,
    from: string,
    text: string,
    _session: UserSession
  ): Promise<void> {
    switch (text) {
      case '1':
        await this.sendUnitPrices(sock, from, 0);
        sessionManager.setState(from, 'menu');
        break;
      case '2':
        await this.sendUnitPrices(sock, from, 1);
        sessionManager.setState(from, 'menu');
        break;
      case '3':
        await this.sendAllPrices(sock, from);
        sessionManager.setState(from, 'menu');
        break;
      default:
        await sendText(sock, from, `❌ Opção inválida. Escolha 1, 2 ou 3.`);
    }
  }

  async sendUnitPrices(sock: WhatsAppSocket, from: string, unitIndex: number): Promise<void> {
    const unidades = getUnidades();
    const unidade = unidades[unitIndex];
    if (!unidade) return;

    let message = `💰 *VALORES - ${unidade.nome}* 💰\n\n`;
    message += `📋 *MENSALIDADES:*\n`;

    unidade.precos.mensalidade.forEach((plano) => {
      message += `• ${plano.frequencia}: ${plano.valor}\n`;
    });

    message += `\n🎾 *AULA AVULSA:* ${unidade.precos.avulsa}\n\n`;
    message += `✅ *PLATAFORMAS ACEITAS:*\n`;
    message += `• Wellhub/Gympass (plano Silver ou superior)\n`;
    message += `• TotalPass (plano TP2 ou superior)\n`;
    message += `• GuruPass (35 créditos por aula)\n`;
    message += `\n💡 *Dica:* A primeira aula experimental é gratuita!\n\n`;
    message += `Digite *MENU* para voltar ao menu principal.`;

    await sendText(sock, from, message);
  }

  async sendAllPrices(sock: WhatsAppSocket, from: string): Promise<void> {
    const unidades = getUnidades();
    let message = `💰 *TABELA COMPLETA DE VALORES* 💰\n`;

    unidades.forEach((unidade) => {
      message += `\n📍 *${unidade.nome}*\n`;
      message += `━━━━━━━━━━━━━━━\n`;
      unidade.precos.mensalidade.forEach((plano) => {
        message += `${plano.frequencia}: ${plano.valor}\n`;
      });
      message += `Avulsa: ${unidade.precos.avulsa}\n`;
    });

    message += `\n✅ *Todas as unidades aceitam:*\n`;
    message += `• Wellhub/Gympass (a partir do Silver)\n• TotalPass (a partir do TP2)\n• GuruPass (35 créditos)\n\n`;
    message += `Digite *MENU* para voltar.`;

    await sendText(sock, from, message);
  }

  async sendPlatformsInfo(sock: WhatsAppSocket, from: string): Promise<void> {
    const message =
      `📱 *PLATAFORMAS DE CHECK-IN* 📱\n\n` +
      `Aceitamos as principais plataformas:\n\n` +
      `1️⃣ *Wellhub (antigo Gympass)*\n` +
      `• ⚠️ Plano mínimo: SILVER\n` +
      `• Check-in pelo app\n\n` +
      `2️⃣ *TotalPass*\n` +
      `• ⚠️ Plano mínimo: TP2\n` +
      `• Check-in pelo app\n\n` +
      `3️⃣ *GuruPass*\n` +
      `• ⚠️ Mínimo: 35 CRÉDITOS\n` +
      `• Agendamento pelo app\n` +
      `• Confirme disponibilidade\n\n` +
      `⚠️ *Importante:*\n` +
      `Faça o check-in ANTES de entrar na quadra!\n\n` +
      `Digite *MENU* para voltar.`;

    await sendText(sock, from, message);
  }

  async sendLocations(sock: WhatsAppSocket, from: string): Promise<void> {
    const unidades = getUnidades();

    for (const unidade of unidades) {
      const endereco = unidade.endereco.replace(/\s+/g, '+').replace(/,/g, '');
      await sendText(
        sock,
        from,
        `📍 *LOCALIZAÇÃO - ${unidade.nome.toUpperCase()}* 📍\n\n` +
          `${unidade.endereco}\n\n` +
          `🗺️ Google Maps:\n` +
          `https://maps.google.com/?q=${endereco}`
      );
    }

    await sendText(sock, from, `Digite *MENU* para voltar ao menu principal.`);
  }

  async sendLevelsInfo(sock: WhatsAppSocket, from: string): Promise<void> {
    const message =
      `🏐 *NÍVEIS DAS TURMAS* ⚽\n\n` +
      `🟢 *INICIANTE A*\n` +
      `• Introdução à recepção e movimentação\n` +
      `• Desenvolver posicionamento\n` +
      `• Aperfeiçoamento de fundamentos\n\n` +
      `🟢 *INICIANTE B*\n` +
      `• Nunca jogou futevôlei\n` +
      `• Aprendizado dos fundamentos\n` +
      `• Familiarização com areia\n` +
      `• Domínio de bola básico\n\n` +
      `🟡 *INTERMEDIÁRIO*\n` +
      `• Já domina passes e recepção\n` +
      `• Desenvolvimento de ataques\n` +
      `• Aperfeiçoamento técnico\n` +
      `• Jogadas em dupla\n\n` +
      `🔴 *AVANÇADO*\n` +
      `• Jogadores experientes\n` +
      `• Treino de alto rendimento\n` +
      `• Preparação para torneios\n\n` +
      `🆓 *LIVRE*\n` +
      `• Todos os níveis juntos\n` +
      `• Prática recreativa\n` +
      `• Jogos e pontos\n\n` +
      `Digite *MENU* para voltar.`;

    await sendText(sock, from, message);
  }

  async sendFAQMenu(sock: WhatsAppSocket, from: string): Promise<void> {
    let message = `❓ *PERGUNTAS FREQUENTES* ❓\n\n`;

    CONFIG.faq.forEach((item, index) => {
      message += `${index + 1}️⃣ ${item.pergunta}\n\n`;
    });

    message += `Digite o número da pergunta ou *MENU* para voltar.`;

    await sendText(sock, from, message);
  }

  async handleFAQOption(
    sock: WhatsAppSocket,
    from: string,
    text: string,
    _session: UserSession
  ): Promise<void> {
    const faqIndex = parseInt(text) - 1;

    if (faqIndex >= 0 && faqIndex < CONFIG.faq.length) {
      const item = CONFIG.faq[faqIndex];
      if (item) {
        await sendText(
          sock,
          from,
          `❓ *${item.pergunta}*\n\n` +
            `💡 ${item.resposta}\n\n` +
            `Tem mais dúvidas? Digite *8* para ver outras perguntas ou *MENU* para voltar.`
        );
      }
      sessionManager.setState(from, 'menu');
    } else {
      await sendText(sock, from, `❌ Opção inválida. Por favor, escolha uma opção válida.`);
    }
  }

  async connectToAgent(sock: WhatsAppSocket, from: string): Promise<void> {
    pauseManager.pauseBot(from);

    await sendText(
      sock,
      from,
      `👤 *FALAR COM ATENDENTE* 👤\n\n` +
        `Aguarde, em breve um de nossos atendentes irá responder.\n\n` +
        `⏰ Horário de atendimento: ${CONFIG.empresa.horarioAtendimento.inicio} às ${CONFIG.empresa.horarioAtendimento.fim}\n\n` +
        `_Digite "menu" a qualquer momento para voltar ao atendimento automático._`
    );
  }
}

export const menuHandler = new MenuHandler();
