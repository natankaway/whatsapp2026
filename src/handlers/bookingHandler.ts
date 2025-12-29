import type { WhatsAppSocket, UserSession, ExperimentalSession } from '../types/index.js';
import CONFIG from '../config/index.js';
import sessionManager from '../utils/sessionManager.js';
import storage from '../utils/storage.js';
import validators from '../utils/validators.js';
import { sendText, getNextWeekdays, getDayName, formatShortDate } from '../utils/messageHelpers.js';
import notificationService from '../services/notification.js';
import logger from '../utils/logger.js';

class BookingHandler {
  async sendExperimentalUnitSelection(sock: WhatsAppSocket, from: string): Promise<void> {
    const message =
      `🏐 *AGENDAR AULA EXPERIMENTAL* ⚽\n\n` +
      `Ótimo! Vamos agendar sua aula experimental! 🎯\n\n` +
      `Escolha a unidade:\n\n` +
      `1 - RECREIO (Praia, Posto 11)\n` +
      `2 - BANGU (Califórnia)\n\n` +
      `Digite o número da unidade ou *MENU* para voltar.`;

    await sendText(sock, from, message);
  }

  async handleBookingFlow(
    sock: WhatsAppSocket,
    from: string,
    text: string,
    session: UserSession
  ): Promise<void> {
    const lowerText = text.toLowerCase().trim();

    switch (session.state) {
      case 'experimental_unit':
        await this.handleExperimentalUnit(sock, from, lowerText, session);
        break;
      case 'experimental_date':
        await this.handleExperimentalDate(sock, from, lowerText, session);
        break;
      case 'experimental_time':
        await this.handleExperimentalTime(sock, from, lowerText, session);
        break;
      case 'experimental_name':
        await this.handleExperimentalName(sock, from, text, session);
        break;
      case 'experimental_companion':
        await this.handleExperimentalCompanion(sock, from, lowerText, session);
        break;
      case 'experimental_companion_name':
        await this.handleExperimentalCompanionName(sock, from, text, session);
        break;
      case 'experimental_confirm':
        await this.handleExperimentalConfirm(sock, from, lowerText, session);
        break;
    }
  }

  async handleExperimentalUnit(
    sock: WhatsAppSocket,
    from: string,
    text: string,
    _session: UserSession
  ): Promise<void> {
    const experimental: ExperimentalSession = {};

    if (text === '1') {
      experimental.unidade = 'RECREIO';
      experimental.filePath = CONFIG.jsonFilePaths.recreio;
    } else if (text === '2') {
      experimental.unidade = 'BANGU';
      experimental.filePath = CONFIG.jsonFilePaths.bangu;
    } else {
      await sendText(sock, from, `❌ Opção inválida. Por favor, escolha 1 ou 2.`);
      return;
    }

    sessionManager.setData(from, 'experimental', experimental);
    sessionManager.setState(from, 'experimental_date');

    await this.sendExperimentalDateSelection(sock, from, experimental.unidade.toLowerCase());
  }

  private async sendExperimentalDateSelection(
    sock: WhatsAppSocket,
    from: string,
    unit: string
  ): Promise<void> {
    const availableDays = unit === 'recreio' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5];
    const dates = getNextWeekdays(5, availableDays);

    sessionManager.setData(from, 'availableDates', dates);

    let message = `📅 *ESCOLHA O DIA*\n\n`;
    dates.forEach((date, index) => {
      message += `${index + 1} - ${getDayName(date)} (${formatShortDate(date)})\n`;
    });
    message += `\nDigite o número do dia ou *MENU* para voltar.`;

    await sendText(sock, from, message);
  }

  async handleExperimentalDate(
    sock: WhatsAppSocket,
    from: string,
    text: string,
    _session: UserSession
  ): Promise<void> {
    const dates = sessionManager.getData<Date[]>(from, 'availableDates') ?? [];
    const dateIndex = parseInt(text) - 1;

    if (dateIndex >= 0 && dateIndex < dates.length) {
      const selectedDate = dates[dateIndex];
      if (!selectedDate) return;

      const experimental = sessionManager.getData<ExperimentalSession>(from, 'experimental') ?? {};
      experimental.selectedDate = selectedDate;
      sessionManager.setData(from, 'experimental', experimental);
      sessionManager.setState(from, 'experimental_time');

      await this.sendTimeSelection(sock, from, experimental, selectedDate);
    } else {
      await sendText(sock, from, `❌ Opção inválida. Por favor, escolha um dia válido.`);
    }
  }

  private async sendTimeSelection(
    sock: WhatsAppSocket,
    from: string,
    experimental: ExperimentalSession,
    selectedDate: Date
  ): Promise<void> {
    const dayOfWeek = selectedDate.getDay();
    const dateISO = selectedDate.toISOString().split('T')[0] ?? '';
    
    let timeOptions: string[] = [];

    if (experimental.unidade === 'RECREIO') {
      timeOptions = ['17:30', '18:30', '19:30'];
    } else {
      // BANGU - Horários específicos por dia da semana
      if (dayOfWeek === 1 || dayOfWeek === 5) {
        // SEGUNDA E SEXTA
        timeOptions = [
          '07:00 LIVRE',
          '08:00 LIVRE',
          '09:00 INICIANTES',
          '17:00 AVANÇADO',
          '18:00 INTERMEDIÁRIO',
          '19:00 INICIANTES',
          '20:00 LIVRE',
        ];
      } else if (dayOfWeek === 3) {
        // QUARTA
        timeOptions = [
          '07:00 LIVRE',
          '08:00 LIVRE',
          '09:00 INICIANTES',
          '17:00 AVANÇADO',
          '18:00 INTERMEDIÁRIO',
          '19:00 INICIANTES',
        ];
      } else if (dayOfWeek === 2 || dayOfWeek === 4) {
        // TERÇA E QUINTA
        timeOptions = [
          '19:00 INTERMEDIÁRIO',
          '20:00 INICIANTES',
          '21:00 AVANÇADO',
        ];
      }
    }

    // Verificar vagas disponíveis
    interface TimeSlot {
      original: string;
      label: string;
    }
    
    const availableTimes: TimeSlot[] = [];
    
    if (experimental.filePath) {
      const agenda = await storage.readAgenda(experimental.filePath);
      const agendaDoDia = agenda[dateISO] ?? {};

      for (const time of timeOptions) {
        const timeKey = time.split(' ')[0] ?? '';
        const spotsTaken = agendaDoDia[timeKey]?.length ?? 0;

        if (experimental.unidade === 'RECREIO') {
          if (spotsTaken < 2) {
            availableTimes.push({
              original: time,
              label: `${time} (${2 - spotsTaken} vagas)`,
            });
          }
        } else {
          // Bangu não tem limite de vagas no agendamento experimental
          availableTimes.push({
            original: time,
            label: time,
          });
        }
      }
    } else {
      for (const time of timeOptions) {
        availableTimes.push({ original: time, label: time });
      }
    }

    if (availableTimes.length === 0) {
      await sendText(
        sock,
        from,
        `😕 Poxa, não há mais vagas para esta data. Por favor, escolha outra.`
      );
      sessionManager.setState(from, 'experimental_date');
      await this.sendExperimentalDateSelection(
        sock,
        from,
        experimental.unidade?.toLowerCase() ?? ''
      );
      return;
    }

    experimental.availableTimes = availableTimes.map((t) => t.original);
    sessionManager.setData(from, 'experimental', experimental);

    let message = `⏰ *Data selecionada!* ✅\n\nHorários disponíveis:\n\n`;
    availableTimes.forEach((slot, index) => {
      message += `${index + 1} - ${slot.label}\n`;
    });
    message += `\nDigite o número do horário ou *MENU* para voltar.`;

    await sendText(sock, from, message);
  }

  async handleExperimentalTime(
    sock: WhatsAppSocket,
    from: string,
    text: string,
    _session: UserSession
  ): Promise<void> {
    const experimental = sessionManager.getData<ExperimentalSession>(from, 'experimental');
    if (!experimental?.availableTimes) return;

    const timeIndex = parseInt(text) - 1;

    if (timeIndex >= 0 && timeIndex < experimental.availableTimes.length) {
      experimental.selectedTime = experimental.availableTimes[timeIndex];
      sessionManager.setData(from, 'experimental', experimental);
      sessionManager.setState(from, 'experimental_name');

      await sendText(
        sock,
        from,
        `✅ *Horário selecionado: ${experimental.selectedTime}*\n\nPor favor, digite seu nome completo:`
      );
    } else {
      await sendText(sock, from, `❌ Opção inválida. Por favor, escolha um horário válido.`);
    }
  }

  async handleExperimentalName(
    sock: WhatsAppSocket,
    from: string,
    text: string,
    _session: UserSession
  ): Promise<void> {
    const sanitizedName = validators.sanitizeName(text);

    if (!validators.isFullName(sanitizedName)) {
      await sendText(sock, from, `❌ Por favor, digite seu nome completo (nome e sobrenome).`);
      return;
    }

    const experimental = sessionManager.getData<ExperimentalSession>(from, 'experimental');
    if (!experimental) return;

    experimental.name = sanitizedName;
    sessionManager.setData(from, 'experimental', experimental);

    // Verificar se pode trazer acompanhante (Recreio com 0 vagas ocupadas)
    if (experimental.unidade === 'RECREIO' && experimental.filePath && experimental.selectedDate) {
      const agenda = await storage.readAgenda(experimental.filePath);
      const dateISO = experimental.selectedDate.toISOString().split('T')[0] ?? '';
      const timeKey = experimental.selectedTime?.split(' ')[0] ?? '';
      const spotsTaken = agenda[dateISO]?.[timeKey]?.length ?? 0;

      if (spotsTaken === 0) {
        sessionManager.setState(from, 'experimental_companion');
        await sendText(
          sock,
          from,
          `✅ *Nome registrado: ${experimental.name}*\n\n` +
            `Você vai trazer alguém para fazer a aula junto?\n\n` +
            `1 - SIM\n2 - NÃO`
        );
        return;
      }
    }

    // Bangu ou Recreio sem vaga para acompanhante
    if (experimental.unidade === 'BANGU') {
      sessionManager.setState(from, 'experimental_companion');
      await sendText(
        sock,
        from,
        `✅ *Nome registrado: ${experimental.name}*\n\n` +
          `Você vai trazer alguém para fazer a aula junto?\n\n` +
          `1 - SIM\n2 - NÃO`
      );
    } else {
      experimental.companion = null;
      sessionManager.setData(from, 'experimental', experimental);
      sessionManager.setState(from, 'experimental_confirm');
      await this.sendExperimentalSummary(sock, from);
    }
  }

  async handleExperimentalCompanion(
    sock: WhatsAppSocket,
    from: string,
    text: string,
    _session: UserSession
  ): Promise<void> {
    const experimental = sessionManager.getData<ExperimentalSession>(from, 'experimental');
    if (!experimental) return;

    if (text === '1' || text === 'sim' || text === 's') {
      sessionManager.setState(from, 'experimental_companion_name');
      await sendText(sock, from, `Digite o nome do acompanhante:`);
    } else if (text === '2' || text === 'não' || text === 'nao' || text === 'n') {
      experimental.companion = null;
      sessionManager.setData(from, 'experimental', experimental);
      sessionManager.setState(from, 'experimental_confirm');
      await this.sendExperimentalSummary(sock, from);
    } else {
      await sendText(sock, from, `❌ Opção inválida. Digite 1 para SIM ou 2 para NÃO.`);
    }
  }

  async handleExperimentalCompanionName(
    sock: WhatsAppSocket,
    from: string,
    text: string,
    _session: UserSession
  ): Promise<void> {
    const experimental = sessionManager.getData<ExperimentalSession>(from, 'experimental');
    if (!experimental) return;

    experimental.companion = validators.sanitizeName(text);
    sessionManager.setData(from, 'experimental', experimental);
    sessionManager.setState(from, 'experimental_confirm');

    await this.sendExperimentalSummary(sock, from);
  }

  private async sendExperimentalSummary(sock: WhatsAppSocket, from: string): Promise<void> {
    const experimental = sessionManager.getData<ExperimentalSession>(from, 'experimental');
    if (!experimental?.selectedDate) return;

    const date = experimental.selectedDate;

    let message = `📋 *RESUMO DO AGENDAMENTO:*\n\n`;
    message += `👤 *Nome:* ${experimental.name}\n`;
    if (experimental.companion) {
      message += `👥 *Acompanhante:* ${experimental.companion}\n`;
    }
    message += `📍 *Unidade:* ${experimental.unidade}\n`;
    message += `📅 *Data:* ${getDayName(date)} (${formatShortDate(date)})\n`;
    message += `⏰ *Horário:* ${experimental.selectedTime}\n\n`;
    message += `Confirma o agendamento?\n\n1 - SIM\n2 - NÃO (alterar dados)`;

    await sendText(sock, from, message);
  }

  async handleExperimentalConfirm(
    sock: WhatsAppSocket,
    from: string,
    text: string,
    _session: UserSession
  ): Promise<void> {
    if (text === '1' || text === 'sim' || text === 's') {
      await this.confirmBooking(sock, from);
    } else if (text === '2' || text === 'não' || text === 'nao' || text === 'n') {
      sessionManager.clearData(from);
      sessionManager.setState(from, 'experimental_unit');
      await this.sendExperimentalUnitSelection(sock, from);
    } else {
      await sendText(sock, from, `❌ Opção inválida. Digite 1 para SIM ou 2 para NÃO.`);
    }
  }

  private async confirmBooking(sock: WhatsAppSocket, from: string): Promise<void> {
    const experimental = sessionManager.getData<ExperimentalSession>(from, 'experimental');
    if (!experimental?.filePath || !experimental.selectedDate) return;

    const dateISO = experimental.selectedDate.toISOString().split('T')[0] ?? '';
    const timeKey = experimental.selectedTime?.split(' ')[0] ?? '';

    // Verificar vagas novamente antes de confirmar (prevenir race condition)
    const agenda = await storage.readAgenda(experimental.filePath);
    
    if (!agenda[dateISO]) {
      agenda[dateISO] = {};
    }
    if (!agenda[dateISO][timeKey]) {
      agenda[dateISO][timeKey] = [];
    }

    const spotsTaken = agenda[dateISO][timeKey]?.length ?? 0;
    const spotsNeeded = experimental.companion ? 2 : 1;

    // Verificar se ainda há vagas (apenas para Recreio que tem limite de 2)
    if (experimental.unidade === 'RECREIO' && spotsTaken + spotsNeeded > 2) {
      await sendText(
        sock,
        from,
        `😕 Poxa! Alguém agendou nesse horário enquanto você preenchia os dados. As vagas acabaram.\n\nDigite *4* para tentar outro horário.`
      );
      sessionManager.clearData(from);
      sessionManager.setState(from, 'menu');
      return;
    }

    // Salvar agendamento
    agenda[dateISO][timeKey]?.push({
      name: experimental.name ?? '',
      phone: from,
      createdAt: new Date().toISOString(),
    });

    if (experimental.companion) {
      agenda[dateISO][timeKey]?.push({
        name: `${experimental.companion} (Acompanhante)`,
        phone: from,
        createdAt: new Date().toISOString(),
      });
    }

    await storage.writeAgenda(experimental.filePath, agenda);

    // Enviar notificação para Telegram
    try {
      await notificationService.sendTelegramNotification({
        unidade: experimental.unidade ?? '',
        name: experimental.name ?? '',
        companion: experimental.companion,
        selectedDate: experimental.selectedDate,
        selectedTime: experimental.selectedTime ?? '',
      });
    } catch (error) {
      logger.error('Erro ao enviar notificação Telegram', error);
    }

    // Mensagem de confirmação
    const date = experimental.selectedDate;
    let message = `✅ *AULA EXPERIMENTAL AGENDADA!*\n\n`;
    message += `Seus dados foram enviados para o professor.\n\n`;
    message += `👤 *Nome:* ${experimental.name}\n`;
    if (experimental.companion) {
      message += `👥 *Acompanhante:* ${experimental.companion}\n`;
    }
    message += `📍 *Unidade:* ${experimental.unidade}\n`;
    message += `📅 *Data:* ${getDayName(date)} (${formatShortDate(date)})\n`;
    message += `⏰ *Horário:* ${experimental.selectedTime}\n`;
    message += `💰 *Valor:* GRATUITO\n\n`;
    message += `📱 *IMPORTANTE:*\n`;
    message += `• Chegue 10 minutos antes\n`;
    message += `• Traga roupa confortável\n`;
    message += `• Use protetor solar\n`;
    message += `• Traga água!\n\n`;
    message += `Até lá! 🏐⚽\n\n`;
    message += `Digite *MENU* para voltar ao menu principal.`;

    await sendText(sock, from, message);

    logger.bookingCreated(
      experimental.name ?? '',
      experimental.unidade ?? '',
      formatShortDate(date)
    );

    // Limpar dados e voltar ao menu
    sessionManager.clearData(from);
    sessionManager.setState(from, 'menu');
  }
}

export const bookingHandler = new BookingHandler();
