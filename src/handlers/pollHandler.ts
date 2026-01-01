import schedule from 'node-schedule';
import type { WhatsAppSocket } from '../types/index.js';
import type { proto } from '@whiskeysockets/baileys';
import CONFIG from '../config/index.js';
import logger from '../utils/logger.js';
import sqliteService from '../database/sqlite.js';
import type { PollScheduleRecord } from '../database/sqlite.js';

// Importar whatsappService para sempre ter o socket atual
import whatsappService from '../services/whatsapp.js';

// Interface para resultado de envio de enquete
interface PollSendResult {
  success: boolean;
  messageId?: string;
  messageKey?: proto.IMessageKey;
}

// =============================================================================
// POLL HANDLER - Sistema robusto de criação de enquetes
// =============================================================================

class PollHandler {
  private enqueteNameIndex: Record<string, number> = {
    segunda: 0,
    terca: 0,
    quarta: 0,
    quinta: 0,
    sexta: 0,
    sabado: 0,
  };

  // Flag para evitar execuções simultâneas
  private isCreatingPoll = false;

  getEnqueteName(dia: string): string {
    const nomes = CONFIG.nomesEnquetes[dia] ?? [];
    const index = this.enqueteNameIndex[dia] ?? 0;
    const nome = nomes[index % nomes.length] ?? `Treino de ${dia} ⚡`;

    this.enqueteNameIndex[dia] = (index + 1) % nomes.length;
    return nome;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Verifica se o socket está REALMENTE conectado e pronto para enviar mensagens
   */
  private async isSocketReady(): Promise<boolean> {
    // Verificar estado de conexão do serviço
    if (!whatsappService.isConnected()) {
      logger.debug('[POLL] WhatsApp não está conectado');
      return false;
    }

    // Verificar se a conexão está estável (conectado há mais de 5 segundos)
    if (!whatsappService.isConnectionStable(5000)) {
      logger.debug('[POLL] Conexão ainda não está estável');
      return false;
    }

    const sock = whatsappService.getSocket();
    
    if (!sock) {
      logger.debug('[POLL] Socket é null');
      return false;
    }

    if (!sock.user) {
      logger.debug('[POLL] Socket não tem user - não autenticado');
      return false;
    }

    return true;
  }

  /**
   * Aguarda até o socket estar conectado com timeout
   */
  private async waitForConnection(maxWaitMs: number = 120000): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 3000; // Verificar a cada 3 segundos
    let attempts = 0;

    logger.info(`[POLL] Aguardando conexão (timeout: ${maxWaitMs / 1000}s)...`);

    while (Date.now() - startTime < maxWaitMs) {
      attempts++;
      
      const state = whatsappService.getConnectionState();
      const uptime = whatsappService.getConnectionUptime();
      
      if (await this.isSocketReady()) {
        logger.info(`[POLL] ✅ Conexão confirmada após ${attempts} verificações (uptime: ${Math.round(uptime/1000)}s)`);
        return true;
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      logger.debug(`[POLL] Aguardando conexão... ${elapsed}s / ${maxWaitMs / 1000}s (estado: ${state})`);
      
      await this.delay(checkInterval);
    }

    logger.error(`[POLL] ❌ Timeout aguardando conexão após ${maxWaitMs / 1000}s`);
    return false;
  }

  /**
   * Envia enquete com tratamento robusto de erros
   */
  private async sendPollMessage(
    groupId: string,
    title: string,
    options: string[]
  ): Promise<PollSendResult> {
    const sock = whatsappService.getSocket();

    if (!sock) {
      throw new Error('Socket não disponível');
    }

    logger.info(`[POLL] Enviando enquete "${title}" para ${groupId}`);

    const result = await sock.sendMessage(groupId, {
      poll: {
        name: title,
        values: options,
        selectableCount: 1,
      },
    });

    if (result?.key?.id) {
      logger.info(`[POLL] ✅ Enquete enviada com sucesso! ID: ${result.key.id}`);
      return {
        success: true,
        messageId: result.key.id,
        messageKey: result.key,
      };
    }

    logger.warn('[POLL] Enquete enviada mas sem confirmação de ID');
    return { success: true }; // Considerar sucesso mesmo sem ID
  }

  /**
   * Cria enquete com sistema robusto de retry e verificação de conexão
   * @param scheduleId - ID do agendamento (opcional, para rastreamento)
   * @param templateId - ID do template (opcional, para rastreamento)
   * @param autoPin - Se true, fixa a enquete automaticamente por 24 horas
   */
  async createPoll(
    groupId: string,
    title: string,
    options: string[],
    scheduleId?: number,
    templateId?: number,
    autoPin: boolean = false
  ): Promise<PollSendResult> {
    // Evitar execuções simultâneas
    if (this.isCreatingPoll) {
      logger.warn('[POLL] Já existe uma criação de enquete em andamento, aguardando...');
      await this.delay(5000);
    }

    this.isCreatingPoll = true;
    const maxRetries = 5;
    const retryDelays = [10000, 20000, 30000, 60000, 120000]; // Delays progressivos

    try {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          logger.info(`[POLL] === Tentativa ${attempt}/${maxRetries} ===`);

          // PASSO 1: Verificar se está conectado
          const isReady = await this.isSocketReady();

          if (!isReady) {
            logger.warn(`[POLL] Conexão não está pronta, aguardando...`);

            // Aguardar conexão com timeout de 2 minutos
            const connected = await this.waitForConnection(120000);

            if (!connected) {
              throw new Error('Não foi possível estabelecer conexão');
            }

            // Delay extra após reconexão para estabilizar
            logger.info('[POLL] Aguardando estabilização após reconexão...');
            await this.delay(5000);
          }

          // PASSO 2: Delay antes de enviar (evita rate limiting)
          await this.delay(2000);

          // PASSO 3: Enviar enquete
          const result = await this.sendPollMessage(groupId, title, options);

          if (result.success) {
            logger.pollCreated(title, groupId);

            // PASSO 4: Salvar enquete enviada no banco de dados
            if (result.messageId && result.messageKey) {
              let sentPollId: number | undefined;

              try {
                const sentPoll = sqliteService.createSentPoll({
                  scheduleId,
                  templateId,
                  groupId,
                  messageId: result.messageId,
                  messageKey: JSON.stringify(result.messageKey),
                  title,
                  options,
                  sentAt: new Date().toISOString(),
                });

                if (sentPoll) {
                  sentPollId = sentPoll.id;
                  logger.info(`[POLL] Enquete salva no banco com ID: ${sentPoll.id}`);
                }
              } catch (dbError) {
                logger.error('[POLL] Erro ao salvar enquete no banco:', dbError);
                // Não falhar a operação por erro de banco
              }

              // PASSO 5: Fixar automaticamente se autoPin estiver ativo
              if (autoPin && result.messageKey) {
                try {
                  // Aguardar um pouco antes de fixar (evita problemas de timing)
                  await this.delay(2000);

                  const pinSuccess = await whatsappService.pinMessage(
                    groupId,
                    {
                      id: result.messageKey.id!,
                      remoteJid: result.messageKey.remoteJid,
                      fromMe: result.messageKey.fromMe,
                      participant: result.messageKey.participant,
                    },
                    86400 // 24 horas
                  );

                  if (pinSuccess) {
                    logger.info(`[POLL] ✅ Enquete fixada automaticamente por 24 horas`);

                    // Atualizar o registro no banco com a data de expiração do pin
                    if (sentPollId) {
                      const pinnedUntil = new Date(Date.now() + 86400 * 1000).toISOString();
                      sqliteService.updateSentPollPinned(sentPollId, pinnedUntil);
                    }
                  } else {
                    logger.warn('[POLL] ⚠️ Não foi possível fixar a enquete automaticamente (bot pode não ser admin)');
                  }
                } catch (pinError) {
                  logger.error('[POLL] Erro ao fixar enquete automaticamente:', pinError);
                  // Não falhar a operação por erro de pin
                }
              }
            }

            return result;
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`[POLL] Tentativa ${attempt}/${maxRetries} falhou: ${errorMessage}`);

          // Se não for a última tentativa, aguardar antes de retry
          if (attempt < maxRetries) {
            const delayMs = retryDelays[attempt - 1] ?? 60000;
            logger.info(`[POLL] Aguardando ${delayMs / 1000}s antes da próxima tentativa...`);
            await this.delay(delayMs);
          }
        }
      }

      logger.error(`[POLL] ❌ FALHA DEFINITIVA: Não foi possível criar enquete "${title}" após ${maxRetries} tentativas`);
      return { success: false };

    } finally {
      this.isCreatingPoll = false;
    }
  }

  /**
   * Wrapper para criar enquete usando socket fornecido (para comandos manuais)
   */
  async createPollWithSocket(
    _sock: WhatsAppSocket,
    groupId: string,
    title: string,
    options: string[]
  ): Promise<void> {
    await this.createPoll(groupId, title, options);
  }

  async handleManualPollCommand(
    _sock: WhatsAppSocket,
    from: string,
    command: string
  ): Promise<boolean> {
    const day = new Date().getDay();
    const dayNames = ['', 'segunda', 'terca', 'quarta', 'quinta', 'sexta'];
    const dayName = dayNames[day] ?? 'segunda';

    // Comando de teste - cria enquete no grupo atual
    if (command === '@bot enquete teste' || command === '@bot teste enquete') {
      logger.info(`[POLL] Teste de enquete solicitado no grupo ${from}`);
      await this.createPoll(from, 'Enquete de Teste ⚡', [
        'Opção 1 ⚡',
        'Opção 2 ⚡',
        'Opção 3 ⚡',
      ]);
      return true;
    }

    if (command === '@bot enquete recreio') {
      const enqueteName = this.getEnqueteName(dayName);
      await this.createPoll(from, enqueteName, ['17:30 ⚡', '18:30 ⚡', '19:30 ⚡']);
      return true;
    }

    if (command === '@bot enquete bangu') {
      const enqueteName = this.getEnqueteName(dayName);

      // Terça e Quinta
      if (day === 2 || day === 4) {
        await this.createPoll(from, enqueteName, [
          '19h00 - INTERMEDIÁRIO ⚡',
          '20h00 - INICIANTES ⚡',
          '21h00 - AVANÇADO ⚡',
        ]);
      } else if (day === 3) {
        // Quarta
        await this.createPoll(from, enqueteName, [
          '07h00 - LIVRE ⚡',
          '08h00 - LIVRE ⚡',
          '09h00 - INICIANTES ⚡',
          '17h00 - AVANÇADO ⚡',
          '18h00 - INTERMEDIÁRIO ⚡',
          '19h00 - INICIANTES ⚡',
        ]);
      } else {
        // Segunda e Sexta
        await this.createPoll(from, enqueteName, [
          '07h00 - LIVRE ⚡',
          '08h00 - LIVRE ⚡',
          '09h00 - INICIANTES ⚡',
          '17h00 - AVANÇADO ⚡',
          '18h00 - INTERMEDIÁRIO ⚡',
          '19h00 - INICIANTES ⚡',
          '20h00 - LIVRE ⚡',
        ]);
      }
      return true;
    }

    if (command === '@bot enquete sabado') {
      const enqueteName = this.getEnqueteName('sabado');
      await this.createPoll(from, enqueteName, ['Treino ⚡', 'Treino + Joguinho ⚡']);
      return true;
    }

    return false;
  }

  /**
   * Executa enquete automática com delay inicial para evitar problemas de timing
   */
  private async executeScheduledPoll(
    description: string,
    groupId: string | undefined,
    title: string,
    options: string[]
  ): Promise<void> {
    logger.info(`⏰ ${description}`);

    if (!groupId) {
      logger.warn(`[POLL] Grupo não configurado para: ${description}`);
      return;
    }

    // Delay aleatório de 5-15 segundos para evitar que todas as enquetes
    // do mesmo horário tentem enviar exatamente ao mesmo tempo
    const randomDelay = 5000 + Math.random() * 10000;
    logger.debug(`[POLL] Aguardando ${Math.round(randomDelay / 1000)}s antes de iniciar...`);
    await this.delay(randomDelay);

    await this.createPoll(groupId, title, options);
  }

  /**
   * Obtém o grupo de destino com base na configuração
   */
  private getGroupId(targetGroup: string, customGroupId?: string): string | undefined {
    if (targetGroup === 'recreio') {
      return CONFIG.gruposWhatsApp.recreio;
    } else if (targetGroup === 'bangu') {
      return CONFIG.gruposWhatsApp.bangu;
    } else if (targetGroup === 'custom' && customGroupId) {
      return customGroupId;
    }
    return undefined;
  }

  /**
   * Obtém o nome da enquete para o dia especificado
   */
  private getPollNameForDay(dayOfWeek: string): string {
    // Se for 'auto', usa o dia atual
    if (dayOfWeek === 'auto') {
      const day = new Date().getDay();
      const dayNames = ['', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
      const dayName = dayNames[day] ?? 'segunda';
      return this.getEnqueteName(dayName);
    }
    return this.getEnqueteName(dayOfWeek);
  }

  /**
   * Executa uma enquete de um agendamento específico
   */
  async executeScheduleById(scheduleId: number): Promise<boolean> {
    const pollSchedule = sqliteService.getPollScheduleById(scheduleId);
    if (!pollSchedule) {
      logger.error(`[POLL] Agendamento #${scheduleId} não encontrado`);
      return false;
    }

    const groupId = this.getGroupId(pollSchedule.targetGroup, pollSchedule.customGroupId);
    if (!groupId) {
      logger.error(`[POLL] Grupo não configurado para agendamento #${scheduleId}`);
      return false;
    }

    const pollName = this.getPollNameForDay(pollSchedule.dayOfWeek);

    logger.info(`[POLL] Executando agendamento #${scheduleId}: ${pollSchedule.name}`);

    // autoPin: true - fixa automaticamente por 24 horas
    const result = await this.createPoll(groupId, pollName, pollSchedule.pollOptions, scheduleId, undefined, true);

    if (result.success) {
      sqliteService.updatePollScheduleLastExecuted(scheduleId);
    }

    return result.success;
  }

  /**
   * Cria cron expression a partir dos dados do agendamento
   */
  private buildCronExpression(schedule: PollScheduleRecord): string {
    const { scheduleHour, scheduleMinute, scheduleDays } = schedule;

    // Se não tem dias configurados, não agenda
    if (!scheduleDays || scheduleDays.length === 0) {
      return '';
    }

    // Formato: minuto hora * * diasDaSemana
    const daysStr = scheduleDays.join(',');
    return `${scheduleMinute} ${scheduleHour} * * ${daysStr}`;
  }

  /**
   * Agenda as enquetes automáticas a partir do banco de dados
   */
  schedulePolls(_sock: WhatsAppSocket): void {
    logger.info(`📅 Configurando enquetes automáticas do banco de dados...`);
    logger.info(`Grupo Recreio: ${CONFIG.gruposWhatsApp.recreio}`);
    logger.info(`Grupo Bangu: ${CONFIG.gruposWhatsApp.bangu}`);

    // Cancelar todos os jobs existentes
    for (const jobName of Object.keys(schedule.scheduledJobs)) {
      schedule.cancelJob(jobName);
    }

    // Buscar agendamentos ativos do banco
    const pollSchedules = sqliteService.getActivePollSchedules();

    if (pollSchedules.length === 0) {
      logger.warn('[POLL] Nenhum agendamento de enquete ativo encontrado');
      return;
    }

    logger.info(`[POLL] Encontrados ${pollSchedules.length} agendamentos ativos`);

    for (const pollSchedule of pollSchedules) {
      const cronExpression = this.buildCronExpression(pollSchedule);

      if (!cronExpression) {
        logger.warn(`[POLL] Agendamento #${pollSchedule.id} sem dias configurados, ignorando`);
        continue;
      }

      const jobName = `poll_schedule_${pollSchedule.id}`;

      schedule.scheduleJob(jobName, cronExpression, async () => {
        const groupId = this.getGroupId(pollSchedule.targetGroup, pollSchedule.customGroupId);

        if (!groupId) {
          logger.warn(`[POLL] Grupo não configurado para: ${pollSchedule.name}`);
          return;
        }

        const pollName = this.getPollNameForDay(pollSchedule.dayOfWeek);

        await this.executeScheduledPoll(
          `Executando enquete automática: ${pollSchedule.name}`,
          groupId,
          pollName,
          pollSchedule.pollOptions
        );

        // Atualizar última execução
        if (pollSchedule.id) {
          sqliteService.updatePollScheduleLastExecuted(pollSchedule.id);
        }
      });

      logger.info(`[POLL] Agendado: ${pollSchedule.name} (${cronExpression})`);
    }

    logger.info('📅 Enquetes automáticas agendadas!');

    // Mostrar próximas execuções
    const jobs = schedule.scheduledJobs;
    for (const [name, job] of Object.entries(jobs)) {
      const next = job.nextInvocation();
      if (next) {
        logger.info(`Próxima execução de ${name}: ${next.toLocaleString('pt-BR')}`);
      }
    }
  }

  /**
   * Reagenda todas as enquetes (útil após alterações no dashboard)
   */
  reschedulePolls(): void {
    logger.info('[POLL] Reagendando enquetes...');
    this.schedulePolls(null as unknown as WhatsAppSocket);
  }

  /**
   * Retorna informações sobre os jobs agendados
   */
  getScheduledJobs(): Array<{ name: string; nextExecution: string | null }> {
    const jobs = schedule.scheduledJobs;
    const result: Array<{ name: string; nextExecution: string | null }> = [];

    for (const [name, job] of Object.entries(jobs)) {
      const next = job.nextInvocation();
      result.push({
        name,
        nextExecution: next ? next.toISOString() : null,
      });
    }

    return result;
  }
}

export const pollHandler = new PollHandler();
