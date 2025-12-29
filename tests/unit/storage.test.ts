import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import storage from '../../src/utils/storage.js';

describe('Storage', () => {
  let tempDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    // Criar diretório temporário para testes
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
    testFilePath = path.join(tempDir, 'test-agenda.json');
  });

  afterEach(async () => {
    // Limpar diretório temporário
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignorar erros de limpeza
    }
  });

  describe('readAgenda', () => {
    it('should return empty object for non-existent file', async () => {
      const result = await storage.readAgenda(testFilePath);
      expect(result).toEqual({});
    });

    it('should read existing agenda file', async () => {
      const testData = {
        '2024-12-25': {
          '17:30': [{ name: 'João Silva', phone: '5521999998888' }],
        },
      };

      await fs.writeFile(testFilePath, JSON.stringify(testData), 'utf8');

      const result = await storage.readAgenda(testFilePath);
      expect(result).toEqual(testData);
    });

    it('should return empty object for invalid JSON', async () => {
      await fs.writeFile(testFilePath, 'invalid json {', 'utf8');

      const result = await storage.readAgenda(testFilePath);
      expect(result).toEqual({});
    });
  });

  describe('writeAgenda', () => {
    it('should write agenda data to file', async () => {
      const testData = {
        '2024-12-25': {
          '17:30': [{ name: 'Maria Santos', phone: '5521988887777' }],
        },
      };

      await storage.writeAgenda(testFilePath, testData);

      const fileContent = await fs.readFile(testFilePath, 'utf8');
      expect(JSON.parse(fileContent)).toEqual(testData);
    });

    it('should create directory if not exists', async () => {
      const nestedPath = path.join(tempDir, 'nested', 'dir', 'agenda.json');

      await storage.writeAgenda(nestedPath, { test: 'data' });

      const exists = await fs.access(nestedPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should create backup file on overwrite', async () => {
      // Primeiro write
      await storage.writeAgenda(testFilePath, { first: 'data' });

      // Segundo write
      await storage.writeAgenda(testFilePath, { second: 'data' });

      // Verificar se backup existe
      const backupPath = testFilePath + '.bak';
      const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);
      expect(backupExists).toBe(true);
    });
  });

});
