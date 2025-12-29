import type { Command, CommandRegistry } from '../types/index.js';
import logger from '../utils/logger.js';
import pingCommand from './ping.js';
import menuCommand from './menu.js';

class CommandLoader {
  private registry: CommandRegistry = {
    commands: new Map(),
    aliases: new Map(),
  };

  private loaded = false;

  async loadCommands(): Promise<void> {
    if (this.loaded) return;

    try {
      // Registrar comandos
      this.registerCommand(pingCommand);
      this.registerCommand(menuCommand);
    } catch (error) {
      logger.error('Erro ao carregar comandos', error as Error);
    }

    this.loaded = true;
    logger.info(`${this.registry.commands.size} comandos carregados`);
  }

  registerCommand(command: Command): void {
    if (!command?.name || typeof command?.execute !== 'function') {
      logger.warn('Comando inválido ignorado');
      return;
    }

    this.registry.commands.set(command.name, command);

    if (command.aliases) {
      for (const alias of command.aliases) {
        this.registry.aliases.set(alias, command.name);
      }
    }

    logger.debug(`Comando registrado: ${command.name}`);
  }

  getCommand(name: string): Command | undefined {
    const commandName = this.registry.aliases.get(name) ?? name;
    return this.registry.commands.get(commandName);
  }

  getAllCommands(): Command[] {
    return Array.from(this.registry.commands.values());
  }

  getCommandsByCategory(category: string): Command[] {
    return this.getAllCommands().filter((cmd) => cmd.category === category);
  }
}

export const commandLoader = new CommandLoader();
