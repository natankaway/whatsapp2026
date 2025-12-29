import type { BaileysEventMap } from '@whiskeysockets/baileys';
import type { WhatsAppSocket, Message } from '../types/index.js';
import logger from '../utils/logger.js';
import sessionManager from '../utils/sessionManager.js';
import pauseManager from '../utils/pauseManager.js';
import {
  extractMessageText,
  isOldMessage,
  parseButtonResponse,
  sendText,
} from '../utils/messageHelpers.js';
import CONFIG from '../config/index.js';
import { commandLoader } from '../commands/loader.js';
import { menuHandler } from '../handlers/menuHandler.js';
import { bookingHandler } from '../handlers/bookingHandler.js';
import { groupHandler } from '../handlers/groupHandler.js';

// =============================================================================
// SISTEMA DE MAPEAMENTO LID <-> JID
// =============================================================================
// O WhatsApp pode usar LID (@lid) ou JID (@s.whatsapp.net) para o mesmo contato
// Precisamos manter um mapeamento bidirecional para pausar corretamente

// Mapa: JID -> LID (quando atendente responde, descobrimos o LID associado)
const jidToLidMap: Map<string, string> = new Map();

// Mapa: LID -> JID (quando cliente manda via LID após já ter mandado via JID)
const lidToJidMap: Map<string, string> = new Map();

// Mapa: chatId -> timestamp da última interação
const activeChats: Map<string, number> = new Map();

// Limpar chats antigos (mais de 2 horas sem interação)
setInterval(() => {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, timestamp] of activeChats.entries()) {
    if (timestamp < twoHoursAgo) {
      activeChats.delete(id);
      // Limpar mapeamentos antigos também
      for (const [jid, lid] of jidToLidMap.entries()) {
        if (lid === id || jid === id) {
          jidToLidMap.delete(jid);
        }
      }
      for (const [lid, jid] of lidToJidMap.entries()) {
        if (lid === id || jid === id) {
          lidToJidMap.delete(lid);
        }
      }
    }
  }
}, 10 * 60 * 1000);

// =============================================================================
// HANDLER PRINCIPAL
// =============================================================================

async function handleMessage(
  sock: WhatsAppSocket,
  data: BaileysEventMap['messages.upsert']
): Promise<void> {
  for (const message of data.messages) {
    try {
      await processMessage(sock, message);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Bad MAC')) {
        logger.warn('Bad MAC Error detectado, ignorando mensagem');
        continue;
      }
      logger.error('Erro ao processar mensagem', error);
    }
  }
}

async function processMessage(sock: WhatsAppSocket, message: Message): Promise<void> {
  const remoteJid = message.key.remoteJid;
  if (!remoteJid) return;

  // Ignorar status e broadcasts
  if (remoteJid === 'status@broadcast') return;

  // Verificar se tem conteúdo
  if (!message.message) {
    return;
  }

  const text = extractMessageText(message);
  const fromMe = message.key.fromMe === true;
  const isGroup = remoteJid.endsWith('@g.us');
  const isLid = remoteJid.endsWith('@lid');

  // ==========================================================================
  // IGNORAR MENSAGENS VAZIAS (reações, confirmações de leitura, etc)
  // ==========================================================================
  if (!text || text.trim() === '') {
    logger.debug(`[SKIP] Mensagem vazia de ${remoteJid}`);
    return;
  }

  // Ignorar mensagens antigas (mais de 60 segundos)
  if (isOldMessage(message, 60000)) {
    logger.debug(`[SKIP] Mensagem antiga de ${remoteJid}`);
    return;
  }

  // ==========================================================================
  // GRUPOS
  // ==========================================================================
  if (isGroup) {
    if (fromMe) return;
    logger.info(`[GRUPO] Mensagem de ${remoteJid}: "${text.substring(0, 50)}"`);
    await groupHandler.handleGroupMessage(sock, remoteJid, text, message);
    return;
  }

  // ==========================================================================
  // CHAT PRIVADO
  // ==========================================================================
  logger.info(`[PRIVADO] De ${remoteJid}, fromMe=${fromMe}, texto="${text.substring(0, 50)}"`);

  // Determinar o chatId a ser usado (resolve LID <-> JID)
  let chatId = remoteJid;

  if (fromMe) {
    // ========================================================================
    // ATENDENTE ENVIANDO MENSAGEM
    // ========================================================================
    
    // Se estamos enviando via JID normal, usar ele
    if (remoteJid.endsWith('@s.whatsapp.net')) {
      chatId = remoteJid;
    }
    // Se estamos enviando via LID, tentar resolver para JID
    else if (isLid) {
      const mappedJid = lidToJidMap.get(remoteJid);
      if (mappedJid) {
        chatId = mappedJid;
      } else {
        // Usar o próprio LID se não tiver mapeamento
        chatId = remoteJid;
      }
    }

    logger.info(`[ATENDENTE] Mensagem para ${chatId}: "${text.substring(0, 50)}"`);

    const textLower = text.toLowerCase().trim();

    // Se digitar 'menu' ou 'bot', reativa o bot
    if (textLower === 'menu' || textLower === 'bot') {
      // Reativar para TODOS os IDs relacionados
      pauseManager.resumeBot(chatId);
      pauseManager.resumeBot(remoteJid);
      if (isLid) {
        const jid = lidToJidMap.get(remoteJid);
        if (jid) pauseManager.resumeBot(jid);
      } else {
        const lid = jidToLidMap.get(remoteJid);
        if (lid) pauseManager.resumeBot(lid);
      }
      
      await sendText(sock, chatId, '🤖 *Bot Reativado!* Voltando ao automático...');
      logger.info(`Bot reativado para ${chatId}`);
      return;
    }

    // Qualquer outra mensagem = pausa o bot
    const alreadyPaused = pauseManager.isPaused(chatId) || pauseManager.isPaused(remoteJid);
    
    if (!alreadyPaused) {
      // Pausar para TODOS os IDs relacionados a este chat
      pauseManager.pauseBot(chatId);
      pauseManager.pauseBot(remoteJid);
      
      // Se temos mapeamento, pausar também o outro ID
      if (isLid) {
        const jid = lidToJidMap.get(remoteJid);
        if (jid) pauseManager.pauseBot(jid);
      } else {
        const lid = jidToLidMap.get(remoteJid);
        if (lid) pauseManager.pauseBot(lid);
      }

      await sendText(
        sock,
        chatId,
        '💬 *Atendimento manual ativado.*\n_Digite "menu" quando quiser voltar ao bot automático._'
      );
      logger.info(`Bot pausado para ${chatId} - Atendente assumiu`);
    }
    
    // Atualizar timestamp
    activeChats.set(chatId, Date.now());
    activeChats.set(remoteJid, Date.now());
    
    return;
  }

  // ==========================================================================
  // CLIENTE ENVIANDO MENSAGEM
  // ==========================================================================
  
  // Atualizar mapeamentos baseado no ID que o cliente usou
  if (isLid) {
    // Cliente mandou via LID
    chatId = remoteJid;
    
    // Verificar se já temos um JID mapeado para este LID
    const existingJid = lidToJidMap.get(remoteJid);
    if (existingJid) {
      // Usar o JID existente como referência principal
      jidToLidMap.set(existingJid, remoteJid);
      
      // IMPORTANTE: Se o JID estava pausado, pausar o LID também
      if (pauseManager.isPaused(existingJid)) {
        pauseManager.pauseBot(remoteJid);
        logger.debug(`LID ${remoteJid} herdou pausa de ${existingJid}`);
      }
    }
    
    // Tentar associar este LID com um JID recente que teve interação do atendente
    // Isso captura casos onde o atendente mandou mensagem e o cliente respondeu via LID
    for (const [jid, timestamp] of activeChats.entries()) {
      if (jid.endsWith('@s.whatsapp.net') && (Date.now() - timestamp) < 10 * 60 * 1000) {
        // JID teve interação nos últimos 10 minutos
        // Verificar se esse JID está pausado (indica atendente mandou mensagem)
        if (pauseManager.isPaused(jid) && !lidToJidMap.has(remoteJid)) {
          // Criar associação
          lidToJidMap.set(remoteJid, jid);
          jidToLidMap.set(jid, remoteJid);
          pauseManager.pauseBot(remoteJid);
          logger.info(`Associação automática criada: ${remoteJid} <-> ${jid}`);
        }
      }
    }
  } else {
    // Cliente mandou via JID normal
    chatId = remoteJid;
    
    // Se existe um LID mapeado, atualizar associação
    const existingLid = jidToLidMap.get(remoteJid);
    if (existingLid) {
      lidToJidMap.set(existingLid, remoteJid);
    }
  }

  // Atualizar timestamps
  activeChats.set(chatId, Date.now());
  activeChats.set(remoteJid, Date.now());

  logger.info(`[CLIENTE] Mensagem de ${chatId}: "${text.substring(0, 50)}"`);

  // ==========================================================================
  // VERIFICAR SE BOT ESTÁ PAUSADO
  // ==========================================================================
  // Verificar pausa para QUALQUER ID relacionado
  const isPausedForChat = pauseManager.isPaused(chatId) || 
                          pauseManager.isPaused(remoteJid) ||
                          (isLid && lidToJidMap.has(remoteJid) && pauseManager.isPaused(lidToJidMap.get(remoteJid)!)) ||
                          (!isLid && jidToLidMap.has(remoteJid) && pauseManager.isPaused(jidToLidMap.get(remoteJid)!));

  if (isPausedForChat) {
    logger.info(`[CLIENTE] Bot pausado para ${chatId}`);
    
    const textLower = text.toLowerCase().trim();
    if (textLower === 'menu') {
      // Reativar para todos os IDs relacionados
      pauseManager.resumeBot(chatId);
      pauseManager.resumeBot(remoteJid);
      if (isLid && lidToJidMap.has(remoteJid)) {
        pauseManager.resumeBot(lidToJidMap.get(remoteJid)!);
      }
      if (!isLid && jidToLidMap.has(remoteJid)) {
        pauseManager.resumeBot(jidToLidMap.get(remoteJid)!);
      }
      
      await sendText(sock, chatId, '🤖 Bot reativado!');
      sessionManager.setState(chatId, 'menu');
      sessionManager.clearData(chatId);
      await sendText(sock, chatId, CONFIG.menuPrincipal);
      logger.info(`Bot reativado para ${chatId} pelo cliente`);
    } else {
      logger.info(`[CLIENTE] Mensagem ignorada (bot pausado): "${text.substring(0, 30)}"`);
    }
    return;
  }

  // ==========================================================================
  // BOT ATIVO - PROCESSAR MENSAGEM NORMALMENTE
  // ==========================================================================
  await handlePrivateMessage(sock, chatId, text, message);
}

// =============================================================================
// PROCESSAR MENSAGEM PRIVADA
// =============================================================================

async function handlePrivateMessage(
  sock: WhatsAppSocket,
  from: string,
  text: string,
  message: Message
): Promise<void> {
  const lowerText = text.toLowerCase().trim();
  const session = sessionManager.getSession(from);

  // Verificar resposta de botão
  const buttonResponse = parseButtonResponse(message);
  if (buttonResponse) {
    await handleButtonResponse(sock, from, buttonResponse.id, session);
    return;
  }

  // Comando menu / saudações
  if (lowerText === 'menu' || lowerText === 'oi' || lowerText === 'olá' || lowerText === 'ola') {
    sessionManager.setState(from, 'menu');
    sessionManager.clearData(from);
    await sendText(sock, from, CONFIG.menuPrincipal);
    return;
  }

  // Tentar executar comando
  const command = commandLoader.getCommand(lowerText);
  if (command && !command.isGroupOnly) {
    await command.execute({
      sock,
      from,
      text,
      message,
      isGroup: false,
      session,
      args: text.split(' ').slice(1),
    });
    return;
  }

  // Processar baseado no estado
  switch (session.state) {
    case 'menu':
      await menuHandler.handleMenuOption(sock, from, lowerText, session);
      break;
    case 'units':
      await menuHandler.handleUnitsOption(sock, from, lowerText, session);
      break;
    case 'prices':
      await menuHandler.handlePricesOption(sock, from, lowerText, session);
      break;
    case 'faq':
      await menuHandler.handleFAQOption(sock, from, lowerText, session);
      break;
    case 'experimental_unit':
    case 'experimental_date':
    case 'experimental_time':
    case 'experimental_name':
    case 'experimental_companion':
    case 'experimental_companion_name':
    case 'experimental_confirm':
      await bookingHandler.handleBookingFlow(sock, from, text, session);
      break;
    case 'waiting_message':
      logger.debug(`Mensagem do usuário ${from}: ${text}`);
      break;
    default:
      sessionManager.setState(from, 'menu');
      await sendText(sock, from, CONFIG.menuPrincipal);
  }
}

// =============================================================================
// PROCESSAR BOTÕES
// =============================================================================

async function handleButtonResponse(
  sock: WhatsAppSocket,
  from: string,
  buttonId: string,
  session: ReturnType<typeof sessionManager.getSession>
): Promise<void> {
  logger.debug(`Botão clicado: ${buttonId} por ${from}`);

  if (buttonId.startsWith('menu_')) {
    const option = buttonId.replace('menu_', '');
    await menuHandler.handleMenuOption(sock, from, option, session);
    return;
  }

  if (buttonId.startsWith('unit_info_')) {
    const unit = buttonId.replace('unit_info_', '');
    const unitIndex = unit === 'recreio' ? 0 : 1;
    await menuHandler.sendUnitDetails(sock, from, unitIndex);
    sessionManager.setState(from, 'menu');
    return;
  }

  if (buttonId.startsWith('unit_')) {
    const unit = buttonId === 'unit_recreio' ? '1' : '2';
    sessionManager.setState(from, 'experimental_unit');
    await bookingHandler.handleExperimentalUnit(sock, from, unit, session);
    return;
  }

  if (buttonId.startsWith('price_')) {
    const option = buttonId.replace('price_', '');
    if (option === 'recreio') {
      await menuHandler.sendUnitPrices(sock, from, 0);
    } else if (option === 'bangu') {
      await menuHandler.sendUnitPrices(sock, from, 1);
    } else if (option === 'all') {
      await menuHandler.sendAllPrices(sock, from);
    }
    sessionManager.setState(from, 'menu');
    return;
  }

  if (buttonId.startsWith('faq_')) {
    const faqIndex = buttonId.replace('faq_', '');
    await menuHandler.handleFAQOption(sock, from, String(parseInt(faqIndex) + 1), session);
    return;
  }

  if (buttonId === 'confirm_yes') {
    await bookingHandler.handleExperimentalConfirm(sock, from, '1', session);
    return;
  }

  if (buttonId === 'confirm_no') {
    await bookingHandler.handleExperimentalConfirm(sock, from, '2', session);
    return;
  }

  if (buttonId === 'companion_yes') {
    await bookingHandler.handleExperimentalCompanion(sock, from, '1', session);
    return;
  }

  if (buttonId === 'companion_no') {
    await bookingHandler.handleExperimentalCompanion(sock, from, '2', session);
    return;
  }

  if (buttonId === 'back_menu') {
    if (pauseManager.isPaused(from)) {
      pauseManager.resumeBot(from);
    }
    sessionManager.setState(from, 'menu');
    await sendText(sock, from, CONFIG.menuPrincipal);
    return;
  }
}

// =============================================================================
// FUNÇÕES AUXILIARES PARA MAPEAMENTO (exportadas para uso em outros módulos)
// =============================================================================

export function mapLidToJid(lid: string, jid: string): void {
  lidToJidMap.set(lid, jid);
  jidToLidMap.set(jid, lid);
  logger.debug(`Mapeamento criado: ${lid} <-> ${jid}`);
}

export function getLidForJid(jid: string): string | undefined {
  return jidToLidMap.get(jid);
}

export function getJidForLid(lid: string): string | undefined {
  return lidToJidMap.get(lid);
}

export { handleMessage };
