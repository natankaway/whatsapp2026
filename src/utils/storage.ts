import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import CONFIG from '../config/index.js';
import logger from './logger.js';
import type { AgendaData } from '../types/index.js';

// =============================================================================
// STORAGE COM ESCRITA ATÔMICA
// =============================================================================
// Usa o padrão write-rename para garantir que escritas sejam atômicas:
// 1. Escreve em arquivo temporário
// 2. Faz backup do arquivo atual (opcional)
// 3. Renomeia o temporário para o destino final (operação atômica no filesystem)
// =============================================================================

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
    } catch (error) {
      // Tentar ler do backup se o arquivo principal estiver corrompido
      const backupPath = filePath + '.bak';
      try {
        await fs.access(backupPath);
        const backupData = await fs.readFile(backupPath, 'utf8');
        logger.warn(`Arquivo principal corrompido, usando backup: ${backupPath}`);

        // Restaurar o arquivo principal do backup
        await fs.copyFile(backupPath, filePath);

        return JSON.parse(backupData) as AgendaData;
      } catch {
        logger.debug(`Arquivo não encontrado: ${filePath}, retornando objeto vazio`);
        return {};
      }
    }
  }

  /**
   * Escreve agenda de forma atômica usando write-rename pattern
   * Previne corrupção de dados em caso de crash durante a escrita
   */
  async writeAgenda(filePath: string, data: AgendaData): Promise<void> {
    const dir = path.dirname(filePath);
    const tempPath = path.join(dir, `.tmp_${randomUUID()}.json`);
    const backupPath = filePath + '.bak';

    try {
      // Garantir que o diretório existe
      await fs.mkdir(dir, { recursive: true });

      // PASSO 1: Escrever em arquivo temporário
      const jsonData = JSON.stringify(data, null, 2);
      await fs.writeFile(tempPath, jsonData, 'utf8');

      // PASSO 2: Verificar integridade do arquivo temporário
      const verification = await fs.readFile(tempPath, 'utf8');
      try {
        JSON.parse(verification);
      } catch {
        throw new Error('Falha na verificação de integridade do arquivo temporário');
      }

      // PASSO 3: Fazer backup do arquivo atual (se existir)
      try {
        await fs.access(filePath);
        await fs.copyFile(filePath, backupPath);
      } catch {
        // Arquivo não existe ainda, não precisa de backup
      }

      // PASSO 4: Renomear temporário para destino (operação atômica)
      await fs.rename(tempPath, filePath);

      logger.debug(`Agenda salva atomicamente: ${filePath}`);
    } catch (error) {
      // Limpar arquivo temporário em caso de erro
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignorar erro ao limpar temp
      }

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

      // Usar escrita atômica também para backups
      await this.writeAtomicFile(backupPath, JSON.stringify(data, null, 2));

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

  /**
   * Escreve JSON de forma atômica
   */
  async writeJSON<T>(filePath: string, data: T): Promise<void> {
    const dir = path.dirname(filePath);
    const tempPath = path.join(dir, `.tmp_${randomUUID()}.json`);

    try {
      await fs.mkdir(dir, { recursive: true });

      // Escrever em temp e renomear
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tempPath, filePath);
    } catch (error) {
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignorar
      }
      throw error;
    }
  }

  /**
   * Escreve arquivo de texto de forma atômica
   */
  private async writeAtomicFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    const tempPath = path.join(dir, `.tmp_${randomUUID()}`);

    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(tempPath, content, 'utf8');
      await fs.rename(tempPath, filePath);
    } catch (error) {
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignorar
      }
      throw error;
    }
  }
}

// Singleton
const storage = new Storage();
export default storage;
