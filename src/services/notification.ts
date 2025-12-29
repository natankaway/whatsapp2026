import axios from 'axios';
import CONFIG from '../config/index.js';
import logger from '../utils/logger.js';
import type { BookingDetails, NotificationResult } from '../types/index.js';

class NotificationService {
  async sendTelegramNotification(bookingDetails: BookingDetails): Promise<NotificationResult[]> {
    const { unidade, name, companion, selectedDate, selectedTime } = bookingDetails;

    const date = selectedDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    let message = `🔔 *Novo Agendamento Experimental* 🔔\n\n`;
    message += `👤 *Nome:* ${name}\n`;
    if (companion) {
      message += `👥 *Acompanhante:* ${companion}\n`;
    }
    message += `📍 *Unidade:* ${unidade}\n`;
    message += `📅 *Data:* ${date}\n`;
    message += `⏰ *Horário:* ${selectedTime.split(' ')[0]}\n`;

    const token = unidade === 'RECREIO' ? CONFIG.telegram.recreioToken : CONFIG.telegram.banguToken;

    const results: NotificationResult[] = [];

    for (const chatId of CONFIG.telegram.notificationChatIds) {
      try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const response = await axios.post<{ ok: boolean; result: { message_id: number } }>(url, {
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        });

        if (response.data.ok) {
          results.push({
            chatId,
            messageId: response.data.result.message_id,
            success: true,
          });
          logger.info(`Notificação enviada para Telegram (Chat ID: ${chatId})`);
        } else {
          results.push({
            chatId,
            success: false,
            error: 'Resposta inválida da API',
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        results.push({
          chatId,
          success: false,
          error: errorMessage,
        });
        logger.error(`Falha ao enviar notificação Telegram (Chat ID: ${chatId})`, error);
      }
    }

    return results;
  }

  async sendCustomNotification(
    message: string,
    unit: 'recreio' | 'bangu' = 'recreio'
  ): Promise<NotificationResult[]> {
    const token = unit === 'recreio' ? CONFIG.telegram.recreioToken : CONFIG.telegram.banguToken;

    const results: NotificationResult[] = [];

    for (const chatId of CONFIG.telegram.notificationChatIds) {
      try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const response = await axios.post<{ ok: boolean; result: { message_id: number } }>(url, {
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        });

        results.push({
          chatId,
          messageId: response.data.ok ? response.data.result.message_id : undefined,
          success: response.data.ok,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        results.push({
          chatId,
          success: false,
          error: errorMessage,
        });
      }
    }

    return results;
  }
}

// Singleton
const notificationService = new NotificationService();
export default notificationService;
