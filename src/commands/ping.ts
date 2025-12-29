import type { Command } from '../types/index.js';
import { sendText } from '../utils/messageHelpers.js';

const pingCommand: Command = {
  name: 'ping',
  aliases: ['p', 'status'],
  description: 'Verifica se o bot está online',
  category: 'menu',
  isPrivateOnly: false,
  isGroupOnly: false,

  async execute(ctx): Promise<void> {
    const start = Date.now();
    await sendText(ctx.sock, ctx.from, '🏓 Pong!');
    const latency = Date.now() - start;
    await sendText(ctx.sock, ctx.from, `⚡ Latência: ${latency}ms`);
  },
};

export default pingCommand;
