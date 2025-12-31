import schedule from 'node-schedule';
import logger from '../utils/logger.js';
import sqliteService from '../database/sqlite.js';
import whatsappService from '../services/whatsapp.js';

// =============================================================================
// BILLING HANDLER - Sistema de cobrança automática
// =============================================================================

export interface BillingConfig {
  enabled: boolean;
  time: string; // HH:MM
  daysOfWeek: number[]; // 0-6 (domingo a sábado)
  message: string;
  pixKey: string;
  pixName: string;
}

const DEFAULT_CONFIG: BillingConfig = {
  enabled: true,
  time: '09:00',
  daysOfWeek: [1, 2, 3, 4, 5], // Segunda a Sexta
  message: `Fala, craque.
Bom dia ⚡️⚡️⚡️
Passando pra lembrar que sua mensalidade vence hoje.
Ter você conosco é muito importante pra nós.
E aí, vamos continuar melhorando juntos?!`,
  pixKey: 'ramoslks7@gmail.com',
  pixName: 'Lukas Ramos',
};

class BillingHandler {
  private config: BillingConfig = DEFAULT_CONFIG;
  private jobName = 'billing_daily_reminder';
  private isSendingReminders = false;

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Carrega configuração do banco de dados ou usa padrão
   */
  loadConfig(): BillingConfig {
    try {
      const configFromDb = sqliteService.getSetting('billing_config');
      if (configFromDb) {
        const parsed = JSON.parse(configFromDb) as Partial<BillingConfig>;
        this.config = { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (error: unknown) {
      logger.warn('[BILLING] Erro ao carregar config do banco, usando padrão', { error: String(error) });
    }
    return this.config;
  }

  /**
   * Salva configuração no banco de dados
   */
  saveConfig(config: Partial<BillingConfig>): void {
    this.config = { ...this.config, ...config };
    sqliteService.setSetting('billing_config', JSON.stringify(this.config));
    logger.info('[BILLING] Configuração salva');
  }

  /**
   * Retorna a configuração atual
   */
  getConfig(): BillingConfig {
    return this.config;
  }

  /**
   * Monta a mensagem de cobrança completa
   */
  private buildMessage(): string {
    return `${this.config.message}

Chave pix: ${this.config.pixKey} (${this.config.pixName})`;
  }

  /**
   * Verifica se o socket está pronto para enviar mensagens
   */
  private async isSocketReady(): Promise<boolean> {
    if (!whatsappService.isConnected()) {
      logger.debug('[BILLING] WhatsApp não está conectado');
      return false;
    }

    if (!whatsappService.isConnectionStable(5000)) {
      logger.debug('[BILLING] Conexão ainda não está estável');
      return false;
    }

    const sock = whatsappService.getSocket();
    if (!sock || !sock.user) {
      logger.debug('[BILLING] Socket não autenticado');
      return false;
    }

    return true;
  }

  /**
   * Aguarda conexão com timeout
   */
  private async waitForConnection(maxWaitMs: number = 60000): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 3000;

    logger.info(`[BILLING] Aguardando conexão (timeout: ${maxWaitMs / 1000}s)...`);

    while (Date.now() - startTime < maxWaitMs) {
      if (await this.isSocketReady()) {
        logger.info('[BILLING] ✅ Conexão confirmada');
        return true;
      }
      await this.delay(checkInterval);
    }

    logger.warn('[BILLING] ⏰ Timeout aguardando conexão');
    return false;
  }

  /**
   * Envia lembretes para todos os alunos com vencimento hoje
   */
  async sendDailyReminders(): Promise<void> {
    if (this.isSendingReminders) {
      logger.warn('[BILLING] Já está enviando lembretes, ignorando');
      return;
    }

    this.isSendingReminders = true;

    try {
      logger.info('[BILLING] 🔔 Iniciando envio de lembretes de cobrança');

      // Verificar se está habilitado
      if (!this.config.enabled) {
        logger.info('[BILLING] Cobrança automática desabilitada');
        return;
      }

      // Aguardar conexão
      if (!(await this.waitForConnection())) {
        logger.error('[BILLING] Não foi possível conectar ao WhatsApp');
        return;
      }

      const sock = whatsappService.getSocket();
      if (!sock) {
        logger.error('[BILLING] Socket não disponível');
        return;
      }

      // Buscar alunos com vencimento hoje
      const students = sqliteService.getStudentsDueToday();

      if (students.length === 0) {
        logger.info('[BILLING] Nenhum aluno com vencimento hoje');
        return;
      }

      logger.info(`[BILLING] Encontrados ${students.length} alunos com vencimento hoje`);

      const message = this.buildMessage();
      let sent = 0;
      let failed = 0;

      for (const student of students) {
        try {
          // Formatar telefone
          let phone = student.phone.replace(/\D/g, '');
          if (!phone.startsWith('55')) {
            phone = '55' + phone;
          }
          const jid = phone + '@s.whatsapp.net';

          // Verificar conexão antes de cada envio
          if (!(await this.isSocketReady())) {
            logger.warn(`[BILLING] Conexão perdida durante envio, pulando ${student.name}`);
            failed++;
            continue;
          }

          await sock.sendMessage(jid, { text: message });

          // Delay entre mensagens para evitar bloqueio
          await this.delay(3000);

          sent++;
          logger.info(`[BILLING] ✅ Lembrete enviado para ${student.name} (${student.phone})`);
        } catch (error) {
          failed++;
          logger.error(`[BILLING] ❌ Erro ao enviar para ${student.name}`, error);
        }
      }

      logger.info(`[BILLING] 📊 Resultado: ${sent} enviados, ${failed} falhas de ${students.length} total`);
    } finally {
      this.isSendingReminders = false;
    }
  }

  /**
   * Agenda o job de cobrança diária
   */
  scheduleDailyBilling(): void {
    this.loadConfig();

    // Cancelar job existente
    if (schedule.scheduledJobs[this.jobName]) {
      schedule.cancelJob(this.jobName);
    }

    if (!this.config.enabled) {
      logger.info('[BILLING] Cobrança automática desabilitada, não agendando');
      return;
    }

    // Parsear hora
    const [hours, minutes] = this.config.time.split(':').map(Number);

    // Construir cron expression
    // Formato: segundo minuto hora dia-mês mês dia-semana
    const daysOfWeek = this.config.daysOfWeek.length > 0 ? this.config.daysOfWeek.join(',') : '*';
    const cronExpression = `0 ${minutes} ${hours} * * ${daysOfWeek}`;

    schedule.scheduleJob(this.jobName, cronExpression, async () => {
      logger.info(`[BILLING] ⏰ Job de cobrança disparado: ${new Date().toLocaleString('pt-BR')}`);
      await this.sendDailyReminders();
    });

    logger.info(`[BILLING] 📅 Cobrança automática agendada: ${this.config.time} nos dias ${this.config.daysOfWeek.join(', ')}`);

    // Mostrar próxima execução
    const job = schedule.scheduledJobs[this.jobName];
    if (job) {
      const next = job.nextInvocation();
      if (next) {
        logger.info(`[BILLING] Próxima execução: ${next.toLocaleString('pt-BR')}`);
      }
    }
  }

  /**
   * Reagenda o job (útil após alterações no dashboard)
   */
  rescheduleBilling(): void {
    logger.info('[BILLING] Reagendando cobrança...');
    this.scheduleDailyBilling();
  }

  /**
   * Retorna informações sobre o job agendado
   */
  getScheduledJob(): { name: string; nextExecution: string | null; config: BillingConfig } {
    const job = schedule.scheduledJobs[this.jobName];
    const next = job?.nextInvocation();

    return {
      name: this.jobName,
      nextExecution: next ? next.toISOString() : null,
      config: this.config,
    };
  }
}

export const billingHandler = new BillingHandler();
