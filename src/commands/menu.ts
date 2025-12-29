import type { Command } from '../types/index.js';
import { sendText } from '../utils/messageHelpers.js';
import CONFIG from '../config/index.js';
import sessionManager from '../utils/sessionManager.js';

const menuCommand: Command = {
  name: 'menu',
  aliases: ['inicio', 'start', 'oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'],
  description: 'Exibe o menu principal',
  category: 'menu',
  isPrivateOnly: true,
  isGroupOnly: false,

  async execute(ctx): Promise<void> {
    sessionManager.setState(ctx.from, 'menu');
    sessionManager.clearData(ctx.from);
    await sendText(ctx.sock, ctx.from, CONFIG.menuPrincipal);
  },
};

export default menuCommand;
