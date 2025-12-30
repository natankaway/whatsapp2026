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
import reminderService, { REMINDER_TEMPLATES } from '../services/reminder.js';
import { v4 as uuidv4 } from 'uuid';
import { sqliteService } from '../database/index.js';

// =============================================================================
// CONSTANTES DE CONFIGURAÇÃO
// =============================================================================

const MAX_MAP_SIZE = 10000; // Limite máximo para Maps em memória
const RATE_LIMIT_MAX = CONFIG.rateLimit.maxRequests;
const RATE_LIMIT_WINDOW = CONFIG.rateLimit.windowMs;

// =============================================================================
// RATE LIMITER INTEGRADO
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
  warned: boolean;
}

const rateLimits: Map<string, RateLimitEntry> = new Map();

function checkRateLimit(chatId: string): { allowed: boolean; shouldWarn: boolean } {
  const now = Date.now();
  const entry = rateLimits.get(chatId);

  if (!entry || now > entry.resetTime) {
    rateLimits.set(chatId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW, warned: false });
    return { allowed: true, shouldWarn: false };
  }

  entry.count++;

  if (entry.count > RATE_LIMIT_MAX) {
    const shouldWarn = !entry.warned;
    entry.warned = true;
    return { allowed: false, shouldWarn };
  }

  return { allowed: true, shouldWarn: false };
}

// =============================================================================
// SISTEMA DE MAPEAMENTO LID <-> JID COM LIMITE DE TAMANHO (LRU-like)
// =============================================================================
// O WhatsApp pode usar LID (@lid) ou JID (@s.whatsapp.net) para o mesmo contato
// Precisamos manter um mapeamento bidirecional para pausar corretamente

// Mapa: JID -> LID (quando atendente responde, descobrimos o LID associado)
const jidToLidMap: Map<string, string> = new Map();

// Mapa: LID -> JID (quando cliente manda via LID após já ter mandado via JID)
const lidToJidMap: Map<string, string> = new Map();

// Mapa: chatId -> timestamp da última interação
const activeChats: Map<string, number> = new Map();

/**
 * Limita o tamanho de um Map removendo as entradas mais antigas
 */
function enforceMapLimit<K, V>(map: Map<K, V>, maxSize: number, getName: string): void {
  if (map.size <= maxSize) return;

  const toRemove = map.size - maxSize + Math.floor(maxSize * 0.1); // Remove 10% extra
  let removed = 0;

  for (const key of map.keys()) {
    if (removed >= toRemove) break;
    map.delete(key);
    removed++;
  }

  logger.debug(`[MEMORY] ${getName}: removidas ${removed} entradas antigas (tamanho: ${map.size})`);
}

/**
 * Limita Maps com base em timestamp (activeChats)
 */
function enforceActiveChatsLimit(): void {
  if (activeChats.size <= MAX_MAP_SIZE) return;

  // Ordenar por timestamp e remover os mais antigos
  const entries = [...activeChats.entries()].sort((a, b) => a[1] - b[1]);
  const toRemove = entries.slice(0, activeChats.size - MAX_MAP_SIZE + 1000);

  for (const [key] of toRemove) {
    activeChats.delete(key);
    // Limpar mapeamentos relacionados
    jidToLidMap.delete(key);
    for (const [lid, jid] of lidToJidMap.entries()) {
      if (jid === key) lidToJidMap.delete(lid);
    }
  }

  logger.debug(`[MEMORY] activeChats: removidas ${toRemove.length} entradas antigas`);
}

// Limpar dados antigos periodicamente
setInterval(() => {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  let cleanedChats = 0;
  let cleanedMappings = 0;

  for (const [id, timestamp] of activeChats.entries()) {
    if (timestamp < twoHoursAgo) {
      activeChats.delete(id);
      cleanedChats++;
      // Limpar mapeamentos antigos também
      if (jidToLidMap.has(id)) {
        jidToLidMap.delete(id);
        cleanedMappings++;
      }
      for (const [lid, jid] of lidToJidMap.entries()) {
        if (jid === id || lid === id) {
          lidToJidMap.delete(lid);
          cleanedMappings++;
        }
      }
    }
  }

  // Limpar rate limits antigos
  const now = Date.now();
  let cleanedRateLimits = 0;
  for (const [key, entry] of rateLimits.entries()) {
    if (now > entry.resetTime) {
      rateLimits.delete(key);
      cleanedRateLimits++;
    }
  }

  // Forçar limites de tamanho
  enforceMapLimit(jidToLidMap, MAX_MAP_SIZE, 'jidToLidMap');
  enforceMapLimit(lidToJidMap, MAX_MAP_SIZE, 'lidToJidMap');
  enforceMapLimit(rateLimits, MAX_MAP_SIZE, 'rateLimits');
  enforceActiveChatsLimit();

  if (cleanedChats > 0 || cleanedMappings > 0 || cleanedRateLimits > 0) {
    logger.info(`[CLEANUP] Removidos: ${cleanedChats} chats, ${cleanedMappings} mapeamentos, ${cleanedRateLimits} rate limits`);
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
    // Gerar correlationId único para rastreamento
    const correlationId = uuidv4().substring(0, 8);

    try {
      await processMessage(sock, message, correlationId);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Bad MAC')) {
        logger.warn(`[${correlationId}] Bad MAC Error detectado, ignorando mensagem`);
        continue;
      }
      logger.error(`[${correlationId}] Erro ao processar mensagem`, error);
    }
  }
}

async function processMessage(
  sock: WhatsAppSocket,
  message: Message,
  correlationId: string
): Promise<void> {
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
    logger.debug(`[${correlationId}] [SKIP] Mensagem vazia de ${remoteJid}`);
    return;
  }

  // Ignorar mensagens antigas (mais de 60 segundos)
  if (isOldMessage(message, 60000)) {
    logger.debug(`[${correlationId}] [SKIP] Mensagem antiga de ${remoteJid}`);
    return;
  }

  // ==========================================================================
  // RATE LIMITING (aplicado antes de processar)
  // ==========================================================================
  if (!fromMe && !isGroup) {
    const rateCheck = checkRateLimit(remoteJid);
    if (!rateCheck.allowed) {
      if (rateCheck.shouldWarn) {
        logger.warn(`[${correlationId}] Rate limit atingido para ${remoteJid}`);
        await sendText(
          sock,
          remoteJid,
          '⚠️ Você está enviando muitas mensagens. Aguarde um momento antes de continuar.'
        );
      }
      return;
    }
  }

  // ==========================================================================
  // VERIFICAÇÃO GLOBAL DE PAUSA/HORÁRIO DE FUNCIONAMENTO
  // ==========================================================================
  if (!fromMe && !isGroup) {
    try {
      const botStatus = sqliteService.shouldBotRespond();
      if (!botStatus.respond) {
        // Bot está pausado ou fora do horário - enviar mensagem apenas uma vez por chat
        const lastGlobalPauseMsg = activeChats.get(`global_pause_${remoteJid}`);
        const now = Date.now();

        // Enviar mensagem apenas se não enviou nos últimos 30 minutos
        if (!lastGlobalPauseMsg || (now - lastGlobalPauseMsg) > 30 * 60 * 1000) {
          activeChats.set(`global_pause_${remoteJid}`, now);
          logger.info(`[${correlationId}] Bot pausado/fora do horário - ${remoteJid}`);
          if (botStatus.message) {
            await sendText(sock, remoteJid, botStatus.message);
          }
        } else {
          logger.debug(`[${correlationId}] Bot pausado - mensagem já enviada recentemente para ${remoteJid}`);
        }
        return;
      }
    } catch (error) {
      // Se der erro ao verificar, continuar normalmente
      logger.debug(`[${correlationId}] Erro ao verificar status global do bot: ${error}`);
    }
  }

  // ==========================================================================
  // GRUPOS
  // ==========================================================================
  if (isGroup) {
    if (fromMe) return;
    logger.info(`[${correlationId}] [GRUPO] Mensagem de ${remoteJid}: "${text.substring(0, 50)}"`);
    await groupHandler.handleGroupMessage(sock, remoteJid, text, message);
    return;
  }

  // ==========================================================================
  // CHAT PRIVADO
  // ==========================================================================
  logger.info(`[${correlationId}] [PRIVADO] De ${remoteJid}, fromMe=${fromMe}, texto="${text.substring(0, 50)}"`);

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

    logger.info(`[${correlationId}] [ATENDENTE] Mensagem para ${chatId}: "${text.substring(0, 50)}"`);

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
      logger.info(`[${correlationId}] Bot reativado para ${chatId}`);
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
      logger.info(`[${correlationId}] Bot pausado para ${chatId} - Atendente assumiu`);
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
        logger.debug(`[${correlationId}] LID ${remoteJid} herdou pausa de ${existingJid}`);
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
          logger.info(`[${correlationId}] Associação automática criada: ${remoteJid} <-> ${jid}`);
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

  logger.info(`[${correlationId}] [CLIENTE] Mensagem de ${chatId}: "${text.substring(0, 50)}"`);

  // ==========================================================================
  // VERIFICAR SE BOT ESTÁ PAUSADO
  // ==========================================================================
  // Verificar pausa para QUALQUER ID relacionado
  const isPausedForChat = pauseManager.isPaused(chatId) ||
                          pauseManager.isPaused(remoteJid) ||
                          (isLid && lidToJidMap.has(remoteJid) && pauseManager.isPaused(lidToJidMap.get(remoteJid)!)) ||
                          (!isLid && jidToLidMap.has(remoteJid) && pauseManager.isPaused(jidToLidMap.get(remoteJid)!));

  if (isPausedForChat) {
    logger.info(`[${correlationId}] [CLIENTE] Bot pausado para ${chatId}`);

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
      logger.info(`[${correlationId}] Bot reativado para ${chatId} pelo cliente`);
    } else {
      logger.info(`[${correlationId}] [CLIENTE] Mensagem ignorada (bot pausado): "${text.substring(0, 30)}"`);
    }
    return;
  }

  // ==========================================================================
  // BOT ATIVO - PROCESSAR MENSAGEM NORMALMENTE
  // ==========================================================================
  await handlePrivateMessage(sock, chatId, text, message, correlationId);
}

// =============================================================================
// PROCESSAR MENSAGEM PRIVADA
// =============================================================================

async function handlePrivateMessage(
  sock: WhatsAppSocket,
  from: string,
  text: string,
  message: Message,
  correlationId: string
): Promise<void> {
  const lowerText = text.toLowerCase().trim();
  const session = sessionManager.getSession(from);

  // Verificar resposta de botão
  const buttonResponse = parseButtonResponse(message);
  if (buttonResponse) {
    await handleButtonResponse(sock, from, buttonResponse.id, session, correlationId);
    return;
  }

  // Comando menu / saudações
  if (lowerText === 'menu' || lowerText === 'oi' || lowerText === 'olá' || lowerText === 'ola') {
    sessionManager.setState(from, 'menu');
    sessionManager.clearData(from);
    await sendText(sock, from, CONFIG.menuPrincipal);
    return;
  }

  // Processar confirmação/cancelamento de lembrete
  if (lowerText === 'confirmar') {
    const result = await reminderService.processConfirmation(from, true);
    if (result.success) {
      // Buscar nome do usuário para mensagem personalizada
      const confirmMessage = REMINDER_TEMPLATES.confirmation_received('');
      await sendText(sock, from, confirmMessage);
      logger.info(`[${correlationId}] Presença confirmada por ${from}`);
    } else {
      await sendText(sock, from, result.message);
    }
    return;
  }

  if (lowerText === 'cancelar') {
    const result = await reminderService.processConfirmation(from, false);
    if (result.success) {
      const cancelMessage = REMINDER_TEMPLATES.cancellation_received('');
      await sendText(sock, from, cancelMessage);
      logger.info(`[${correlationId}] Agendamento cancelado por ${from}`);
    } else {
      await sendText(sock, from, result.message);
    }
    return;
  }

  // Tentar executar comando
  const command = commandLoader.getCommand(lowerText);
  if (command && !command.isGroupOnly) {
    logger.commandExecuted(command.name, from);
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
      logger.debug(`[${correlationId}] Mensagem do usuário ${from}: ${text}`);
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
  session: ReturnType<typeof sessionManager.getSession>,
  correlationId: string
): Promise<void> {
  logger.debug(`[${correlationId}] Botão clicado: ${buttonId} por ${from}`);

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

// =============================================================================
// ESTATÍSTICAS (para monitoramento)
// =============================================================================

export function getMemoryStats(): {
  activeChats: number;
  jidToLidMappings: number;
  lidToJidMappings: number;
  rateLimits: number;
} {
  return {
    activeChats: activeChats.size,
    jidToLidMappings: jidToLidMap.size,
    lidToJidMappings: lidToJidMap.size,
    rateLimits: rateLimits.size,
  };
}

export { handleMessage };
