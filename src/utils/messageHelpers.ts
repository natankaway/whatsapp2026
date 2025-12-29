import type { WhatsAppSocket, Message, ButtonResponse } from '../types/index.js';
import logger from './logger.js';

// Extrair texto de diferentes tipos de mensagem
export function extractMessageText(message: Message): string {
  const msg = message.message;
  if (!msg) return '';

  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    msg.documentMessage?.caption ??
    msg.buttonsResponseMessage?.selectedDisplayText ??
    msg.listResponseMessage?.title ??
    ''
  );
}

// Verificar se é mensagem do próprio bot
export function isFromMe(message: Message): boolean {
  return message.key.fromMe ?? false;
}

// Verificar se é grupo
export function isGroupMessage(message: Message): boolean {
  return (message.key.remoteJid ?? '').endsWith('@g.us');
}

// Obter remetente
export function getSender(message: Message): string {
  return message.key.remoteJid ?? '';
}

// Verificar idade da mensagem
export function isOldMessage(message: Message, maxAgeMs: number = 5 * 60 * 1000): boolean {
  const timestamp = message.messageTimestamp;
  if (!timestamp) return true;

  const messageTime = typeof timestamp === 'number' ? timestamp * 1000 : Number(timestamp) * 1000;
  return Date.now() - messageTime > maxAgeMs;
}

// Parse de resposta de botão interativo
export function parseButtonResponse(message: Message): ButtonResponse | null {
  try {
    const msg = message.message;
    if (!msg) return null;

    // Resposta de botão rápido
    if (msg.buttonsResponseMessage) {
      return {
        type: 'button',
        id: msg.buttonsResponseMessage.selectedButtonId ?? '',
        text: msg.buttonsResponseMessage.selectedDisplayText ?? '',
      };
    }

    // Resposta de lista
    if (msg.listResponseMessage) {
      return {
        type: 'list',
        id: msg.listResponseMessage.singleSelectReply?.selectedRowId ?? '',
        text: msg.listResponseMessage.title ?? '',
      };
    }

    // Resposta de mensagem interativa nativa
    if (msg.interactiveResponseMessage) {
      const response = msg.interactiveResponseMessage;

      if (response.nativeFlowResponseMessage) {
        try {
          const params = JSON.parse(response.nativeFlowResponseMessage.paramsJson ?? '{}') as {
            id?: string;
            display_text?: string;
          };
          return {
            type: 'interactive',
            id: params.id ?? response.nativeFlowResponseMessage.name ?? '',
            text: params.display_text ?? params.id ?? '',
          };
        } catch {
          return null;
        }
      }
    }

    return null;
  } catch (error) {
    logger.error('Erro ao parsear resposta de botão', error);
    return null;
  }
}

// Enviar mensagem de texto
export async function sendText(
  sock: WhatsAppSocket,
  to: string,
  text: string
): Promise<void> {
  await sock.sendMessage(to, { text });
}

// Enviar mensagem com menções
export async function sendTextWithMentions(
  sock: WhatsAppSocket,
  to: string,
  text: string,
  mentions: string[]
): Promise<void> {
  await sock.sendMessage(to, { text, mentions });
}

// Enviar reação
export async function sendReaction(
  sock: WhatsAppSocket,
  message: Message,
  emoji: string
): Promise<void> {
  await sock.sendMessage(message.key.remoteJid ?? '', {
    react: { text: emoji, key: message.key },
  });
}

// Marcar como lida
export async function markAsRead(sock: WhatsAppSocket, message: Message): Promise<void> {
  await sock.readMessages([message.key]);
}

// Indicador de digitando
export async function sendTyping(sock: WhatsAppSocket, to: string): Promise<void> {
  await sock.sendPresenceUpdate('composing', to);
}

// Parar indicador de digitando
export async function stopTyping(sock: WhatsAppSocket, to: string): Promise<void> {
  await sock.sendPresenceUpdate('paused', to);
}

// Delay utilitário
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Formatar data para exibição
export function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// Formatar data curta
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

// Obter nome do dia da semana
export function getDayName(date: Date): string {
  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return days[date.getDay()] ?? '';
}

// Obter próximos dias úteis
export function getNextWeekdays(count: number, allowedDays: number[] = [1, 2, 3, 4, 5]): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  let current = new Date(today);

  while (dates.length < count) {
    current.setDate(current.getDate() + 1);
    if (allowedDays.includes(current.getDay())) {
      dates.push(new Date(current));
    }
  }

  return dates;
}
