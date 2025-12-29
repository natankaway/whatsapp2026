import fs from 'fs/promises';
import path from 'path';
import CONFIG from '../config/index.js';
import logger from './logger.js';
import type { AgendaData } from '../types/index.js';

class Storage {
  constructor() {
    this.initDirectories();
  }

  private async initDirectories(): Promise<void> {
    const dirs = [CONFIG.paths.data, CONFIG.paths.backups, CONFIG.paths.logs];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        logger.error(`Erro ao criar diretório: ${dir}`, error);
      }
    }
  }

  async readAgenda(filePath: string): Promise<AgendaData> {
    try {
      await fs.access(filePath);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data) as AgendaData;
    } catch {
      logger.debug(`Arquivo não encontrado: ${filePath}, retornando objeto vazio`);
      return {};
    }
  }

  async writeAgenda(filePath: string, data: AgendaData): Promise<void> {
    try {
      // Garantir que o diretório existe
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      logger.debug(`Agenda salva: ${filePath}`);
    } catch (error) {
      logger.error(`Erro ao salvar agenda: ${filePath}`, error);
      throw error;
    }
  }

  async backup(unit: 'recreio' | 'bangu'): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const sourcePath = CONFIG.jsonFilePaths[unit];
      const backupPath = path.join(CONFIG.paths.backups, `${unit}_${timestamp}.json`);

      const data = await this.readAgenda(sourcePath);
      await fs.writeFile(backupPath, JSON.stringify(data, null, 2), 'utf8');

      logger.info(`Backup criado: ${backupPath}`);

      // Limpar backups antigos
      await this.cleanOldBackups(unit, 30);

      return backupPath;
    } catch (error) {
      logger.error('Erro ao criar backup', error);
      throw error;
    }
  }

  private async cleanOldBackups(unit: string, daysToKeep: number): Promise<void> {
    try {
      const files = await fs.readdir(CONFIG.paths.backups);
      const now = Date.now();
      const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (file.startsWith(unit)) {
          const filePath = path.join(CONFIG.paths.backups, file);
          const stats = await fs.stat(filePath);

          if (now - stats.mtime.getTime() > maxAge) {
            await fs.unlink(filePath);
            logger.debug(`Backup antigo removido: ${file}`);
          }
        }
      }
    } catch (error) {
      logger.error('Erro ao limpar backups antigos', error);
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async readJSON<T>(filePath: string): Promise<T | null> {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  async writeJSON<T>(filePath: string, data: T): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }
}

// Singleton
const storage = new Storage();
export default storage;
