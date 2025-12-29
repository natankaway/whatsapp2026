import axios from 'axios';
import logger from '../utils/logger.js';

// =============================================================================
// ALERT SERVICE
// =============================================================================
// Envia alertas para canais externos (Slack) quando eventos importantes ocorrem.
// =============================================================================

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

interface AlertPayload {
  level: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  fields?: Record<string, string>;
}

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
}

class AlertService {
  private isEnabled: boolean;
  private recentAlerts: Map<string, number> = new Map();
  private readonly cooldownMs = 5 * 60 * 1000; // 5 minutos de cooldown

  constructor() {
    this.isEnabled = !!SLACK_WEBHOOK_URL;

    if (!this.isEnabled) {
      logger.warn('[Alerts] Slack não configurado. Alertas desabilitados.');
    } else {
      logger.info('[Alerts] Serviço de alertas inicializado');
    }
  }

  // ===========================================================================
  // MÉTODOS PÚBLICOS
  // ===========================================================================

  /**
   * Envia um alerta genérico
   */
  async send(payload: AlertPayload): Promise<boolean> {
    if (!this.isEnabled) {
      logger.debug(`[Alerts] Alerta ignorado (Slack não configurado): ${payload.title}`);
      return false;
    }

    // Verificar cooldown
    const alertKey = `${payload.level}:${payload.title}`;
    const lastSent = this.recentAlerts.get(alertKey);

    if (lastSent && Date.now() - lastSent < this.cooldownMs) {
      logger.debug(`[Alerts] Alerta em cooldown: ${payload.title}`);
      return false;
    }

    try {
      await this.sendToSlack(payload);
      this.recentAlerts.set(alertKey, Date.now());
      logger.info(`[Alerts] Alerta enviado: ${payload.title}`);
      return true;
    } catch (error) {
      logger.error(`[Alerts] Erro ao enviar alerta: ${payload.title}`, error);
      return false;
    }
  }

  /**
   * Alerta de erro crítico
   */
  async critical(title: string, message: string, fields?: Record<string, string>): Promise<boolean> {
    return this.send({ level: 'critical', title, message, fields });
  }

  /**
   * Alerta de erro
   */
  async error(title: string, message: string, fields?: Record<string, string>): Promise<boolean> {
    return this.send({ level: 'error', title, message, fields });
  }

  /**
   * Alerta de aviso
   */
  async warning(title: string, message: string, fields?: Record<string, string>): Promise<boolean> {
    return this.send({ level: 'warning', title, message, fields });
  }

  /**
   * Alerta informativo
   */
  async info(title: string, message: string, fields?: Record<string, string>): Promise<boolean> {
    return this.send({ level: 'info', title, message, fields });
  }

  // ===========================================================================
  // ALERTAS PRÉ-DEFINIDOS
  // ===========================================================================

  /**
   * Alerta quando o bot desconecta do WhatsApp
   */
  async onWhatsAppDisconnect(reason?: string): Promise<void> {
    await this.critical(
      '🔴 Bot Desconectado',
      'O bot perdeu a conexão com o WhatsApp.',
      {
        Motivo: reason ?? 'Desconhecido',
        Horário: new Date().toLocaleString('pt-BR'),
      }
    );
  }

  /**
   * Alerta quando o bot reconecta
   */
  async onWhatsAppReconnect(): Promise<void> {
    await this.info(
      '🟢 Bot Reconectado',
      'O bot reconectou ao WhatsApp com sucesso.',
      {
        Horário: new Date().toLocaleString('pt-BR'),
      }
    );
  }

  /**
   * Alerta de alto uso de memória
   */
  async onHighMemoryUsage(usageMB: number, thresholdMB: number): Promise<void> {
    await this.warning(
      '⚠️ Alto Uso de Memória',
      `O uso de memória está acima do limite recomendado.`,
      {
        'Uso Atual': `${usageMB} MB`,
        'Limite': `${thresholdMB} MB`,
        'Percentual': `${Math.round((usageMB / thresholdMB) * 100)}%`,
      }
    );
  }

  /**
   * Alerta de muitos erros
   */
  async onHighErrorRate(errorCount: number, windowMinutes: number): Promise<void> {
    await this.error(
      '🚨 Alta Taxa de Erros',
      `Muitos erros detectados nos últimos ${windowMinutes} minutos.`,
      {
        'Total de Erros': String(errorCount),
        Período: `${windowMinutes} minutos`,
      }
    );
  }

  /**
   * Alerta de circuit breaker aberto
   */
  async onCircuitBreakerOpen(name: string): Promise<void> {
    await this.error(
      '⚡ Circuit Breaker Aberto',
      `O circuit breaker "${name}" foi aberto devido a muitas falhas.`,
      {
        Serviço: name,
        Horário: new Date().toLocaleString('pt-BR'),
      }
    );
  }

  /**
   * Alerta de backup concluído
   */
  async onBackupCompleted(filesCount: number): Promise<void> {
    await this.info(
      '💾 Backup Concluído',
      'Backup automático realizado com sucesso.',
      {
        'Arquivos': String(filesCount),
        'Horário': new Date().toLocaleString('pt-BR'),
      }
    );
  }

  // ===========================================================================
  // MÉTODOS PRIVADOS
  // ===========================================================================

  private async sendToSlack(payload: AlertPayload): Promise<void> {
    if (!SLACK_WEBHOOK_URL) return;

    const emoji = this.getEmoji(payload.level);
    const color = this.getColor(payload.level);

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${payload.title}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: payload.message,
        },
      },
    ];

    // Adicionar campos se existirem
    if (payload.fields && Object.keys(payload.fields).length > 0) {
      blocks.push({
        type: 'section',
        fields: Object.entries(payload.fields).map(([key, value]) => ({
          type: 'mrkdwn',
          text: `*${key}:*\n${value}`,
        })),
      });
    }

    // Adicionar contexto
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🤖 CT LK Futevôlei Bot | ${new Date().toISOString()}`,
        },
      ],
    } as unknown as SlackBlock);

    await axios.post(SLACK_WEBHOOK_URL, {
      attachments: [
        {
          color,
          blocks,
        },
      ],
    });
  }

  private getEmoji(level: AlertPayload['level']): string {
    switch (level) {
      case 'critical': return '🔴';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📢';
    }
  }

  private getColor(level: AlertPayload['level']): string {
    switch (level) {
      case 'critical': return '#ff0000';
      case 'error': return '#dc3545';
      case 'warning': return '#ffc107';
      case 'info': return '#17a2b8';
      default: return '#6c757d';
    }
  }
}

// Singleton
const alertService = new AlertService();
export default alertService;
