import fs from 'fs/promises';
import path from 'path';
import { sqliteService } from '../database/index.js';
import CONFIG from '../config/index.js';
import storage from '../utils/storage.js';
import logger from '../utils/logger.js';

// =============================================================================
// BACKUP SERVICE
// =============================================================================
// Gerencia backups automáticos do banco de dados e arquivos JSON.
// Executa diariamente e mantém histórico de backups.
// =============================================================================

const BACKUP_HOUR = 3; // 3h da manhã
const BACKUP_INTERVAL_CHECK = 60 * 60 * 1000; // Verificar a cada hora

class BackupService {
  private timer: NodeJS.Timeout | null = null;
  private lastBackupDate: string | null = null;

  /**
   * Inicia o serviço de backup automático
   */
  start(): void {
    // Verificar imediatamente se precisa fazer backup
    this.checkAndRunBackup();

    // Agendar verificações periódicas
    this.timer = setInterval(() => {
      this.checkAndRunBackup();
    }, BACKUP_INTERVAL_CHECK);

    logger.info('[Backup] Serviço de backup automático iniciado');
  }

  /**
   * Para o serviço de backup
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[Backup] Serviço de backup parado');
    }
  }

  /**
   * Verifica se é hora de fazer backup e executa
   */
  private async checkAndRunBackup(): Promise<void> {
    const now = new Date();
    const today = now.toISOString().split('T')[0] ?? '';
    const hour = now.getHours();

    // Só fazer backup se for a hora correta e ainda não fez hoje
    if (hour === BACKUP_HOUR && this.lastBackupDate !== today) {
      await this.runBackup();
      this.lastBackupDate = today;
    }
  }

  /**
   * Executa backup completo
   */
  async runBackup(): Promise<{ success: boolean; files: string[] }> {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0] ?? '';
    const backupFiles: string[] = [];

    logger.info('[Backup] Iniciando backup automático...');

    try {
      // Garantir que o diretório de backup existe
      await fs.mkdir(CONFIG.paths.backups, { recursive: true });

      // 1. Backup do banco SQLite
      if (sqliteService.isReady()) {
        const sqliteBackupPath = await this.backupSQLite(timestamp);
        if (sqliteBackupPath) {
          backupFiles.push(sqliteBackupPath);
        }
      }

      // 2. Backup dos arquivos JSON (legado)
      const jsonBackups = await this.backupLegacyJSON(timestamp);
      backupFiles.push(...jsonBackups);

      // 3. Limpar backups antigos
      await this.cleanOldBackups(30);

      logger.info(`[Backup] Backup concluído com sucesso. ${backupFiles.length} arquivos criados.`);

      return { success: true, files: backupFiles };
    } catch (error) {
      logger.error('[Backup] Erro ao executar backup', error);
      return { success: false, files: backupFiles };
    }
  }

  /**
   * Faz backup do banco SQLite
   */
  private async backupSQLite(timestamp: string): Promise<string | null> {
    try {
      const sourcePath = path.join(CONFIG.paths.data, 'bot.db');
      const backupPath = path.join(CONFIG.paths.backups, `sqlite_${timestamp}.db`);

      // Verificar se o banco existe
      try {
        await fs.access(sourcePath);
      } catch {
        logger.debug('[Backup] Banco SQLite não encontrado, pulando...');
        return null;
      }

      // Copiar o arquivo do banco
      await fs.copyFile(sourcePath, backupPath);

      // Registrar backup no banco
      const stats = await fs.stat(backupPath);
      sqliteService.logBackup('sqlite', backupPath, stats.size);

      logger.info(`[Backup] SQLite: ${backupPath}`);
      return backupPath;
    } catch (error) {
      logger.error('[Backup] Erro ao fazer backup do SQLite', error);
      return null;
    }
  }

  /**
   * Faz backup dos arquivos JSON legados
   */
  private async backupLegacyJSON(timestamp: string): Promise<string[]> {
    const backupFiles: string[] = [];

    for (const unit of ['recreio', 'bangu'] as const) {
      try {
        const sourcePath = CONFIG.jsonFilePaths[unit];

        // Verificar se o arquivo existe
        try {
          await fs.access(sourcePath);
        } catch {
          continue;
        }

        const data = await storage.readAgenda(sourcePath);

        // Só fazer backup se tiver dados
        if (Object.keys(data).length === 0) {
          continue;
        }

        const backupPath = path.join(CONFIG.paths.backups, `${unit}_${timestamp}.json`);
        await fs.writeFile(backupPath, JSON.stringify(data, null, 2), 'utf8');

        // Registrar backup
        const stats = await fs.stat(backupPath);
        if (sqliteService.isReady()) {
          sqliteService.logBackup(`json_${unit}`, backupPath, stats.size);
        }

        logger.info(`[Backup] JSON ${unit}: ${backupPath}`);
        backupFiles.push(backupPath);
      } catch (error) {
        logger.error(`[Backup] Erro ao fazer backup do JSON ${unit}`, error);
      }
    }

    return backupFiles;
  }

  /**
   * Remove backups antigos
   */
  private async cleanOldBackups(daysToKeep: number): Promise<void> {
    try {
      const files = await fs.readdir(CONFIG.paths.backups);
      const now = Date.now();
      const maxAge = daysToKeep * 24 * 60 * 60 * 1000;
      let cleaned = 0;

      for (const file of files) {
        const filePath = path.join(CONFIG.paths.backups, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.info(`[Backup] ${cleaned} backups antigos removidos`);
      }
    } catch (error) {
      logger.error('[Backup] Erro ao limpar backups antigos', error);
    }
  }

  /**
   * Migra dados dos arquivos JSON para o SQLite
   */
  async migrateJSONToSQLite(): Promise<{ recreio: number; bangu: number }> {
    if (!sqliteService.isReady()) {
      logger.warn('[Backup] SQLite não está pronto, migração cancelada');
      return { recreio: 0, bangu: 0 };
    }

    const result = { recreio: 0, bangu: 0 };

    for (const unit of ['recreio', 'bangu'] as const) {
      try {
        const sourcePath = CONFIG.jsonFilePaths[unit];
        const data = await storage.readAgenda(sourcePath);

        if (Object.keys(data).length > 0) {
          const imported = sqliteService.importFromLegacyJSON(unit, data);
          result[unit] = imported;
          logger.info(`[Backup] Migrados ${imported} registros de ${unit}`);
        }
      } catch (error) {
        logger.error(`[Backup] Erro ao migrar ${unit}`, error);
      }
    }

    return result;
  }
}

// Singleton
const backupService = new BackupService();
export default backupService;
