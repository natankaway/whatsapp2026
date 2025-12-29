import { describe, it, expect } from 'vitest';
import validators from '../../src/utils/validators.js';

describe('Validators', () => {
  describe('isFullName', () => {
    it('should return true for valid full names', () => {
      expect(validators.isFullName('João Silva')).toBe(true);
      expect(validators.isFullName('Maria da Silva Santos')).toBe(true);
      expect(validators.isFullName('José Carlos de Oliveira')).toBe(true);
    });

    it('should return false for single names', () => {
      expect(validators.isFullName('João')).toBe(false);
      expect(validators.isFullName('Maria')).toBe(false);
    });

    it('should return false for empty or whitespace', () => {
      expect(validators.isFullName('')).toBe(false);
      expect(validators.isFullName('   ')).toBe(false);
    });

    it('should return false for names shorter than 3 characters', () => {
      expect(validators.isFullName('Jo')).toBe(false);
    });
  });

  describe('sanitizeName', () => {
    it('should trim whitespace', () => {
      expect(validators.sanitizeName('  João Silva  ')).toBe('João Silva');
    });

    it('should handle multiple spaces', () => {
      expect(validators.sanitizeName('João   Silva')).toBe('João Silva');
    });

    it('should remove HTML tags', () => {
      expect(validators.sanitizeName('João <b>Silva</b>')).toBe('João bSilva/b');
    });

    it('should truncate long names', () => {
      const longName = 'A'.repeat(200);
      expect(validators.sanitizeName(longName).length).toBeLessThanOrEqual(100);
    });
  });

  describe('isValidPhone', () => {
    it('should validate Brazilian phone numbers', () => {
      expect(validators.isValidPhone('5521999998888')).toBe(true);
      expect(validators.isValidPhone('5511988887777')).toBe(true);
    });

    it('should accept numbers with formatting', () => {
      expect(validators.isValidPhone('+55 21 99999-8888')).toBe(true);
      expect(validators.isValidPhone('(21) 99999-8888')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(validators.isValidPhone('123')).toBe(false);
      expect(validators.isValidPhone('')).toBe(false);
    });
  });

  describe('isValidTime', () => {
    it('should validate correct time formats', () => {
      expect(validators.isValidTime('17:30')).toBe(true);
      expect(validators.isValidTime('08:00')).toBe(true);
      expect(validators.isValidTime('23:59')).toBe(true);
      expect(validators.isValidTime('0:00')).toBe(true);
    });

    it('should reject invalid time formats', () => {
      expect(validators.isValidTime('25:00')).toBe(false);
      expect(validators.isValidTime('12:60')).toBe(false);
      expect(validators.isValidTime('1730')).toBe(false);
      expect(validators.isValidTime('')).toBe(false);
    });
  });

  describe('isValidDate', () => {
    it('should validate Date objects', () => {
      expect(validators.isValidDate(new Date())).toBe(true);
      expect(validators.isValidDate(new Date('2024-12-25'))).toBe(true);
    });

    it('should reject invalid dates', () => {
      expect(validators.isValidDate(new Date('invalid'))).toBe(false);
      expect(validators.isValidDate('2024-12-25')).toBe(false);
      expect(validators.isValidDate(null)).toBe(false);
    });
  });

  describe('isGroupId', () => {
    it('should identify group IDs', () => {
      expect(validators.isGroupId('120363208643524067@g.us')).toBe(true);
    });

    it('should reject non-group IDs', () => {
      expect(validators.isGroupId('5521999998888@s.whatsapp.net')).toBe(false);
    });
  });

  describe('isPrivateId', () => {
    it('should identify private chat IDs', () => {
      expect(validators.isPrivateId('5521999998888@s.whatsapp.net')).toBe(true);
    });

    it('should reject group IDs', () => {
      expect(validators.isPrivateId('120363208643524067@g.us')).toBe(false);
    });
  });

  describe('parsePhoneFromJid', () => {
    it('should extract phone from JID', () => {
      expect(validators.parsePhoneFromJid('5521999998888@s.whatsapp.net')).toBe('5521999998888');
    });

    it('should handle JIDs without @', () => {
      expect(validators.parsePhoneFromJid('5521999998888')).toBe('5521999998888');
    });
  });

  describe('sanitizeText', () => {
    it('should trim whitespace', () => {
      expect(validators.sanitizeText('  hello  ')).toBe('hello');
    });

    it('should remove HTML tags', () => {
      expect(validators.sanitizeText('<script>alert()</script>')).toBe('scriptalert()/script');
    });

    it('should truncate long text', () => {
      const longText = 'A'.repeat(2000);
      expect(validators.sanitizeText(longText).length).toBeLessThanOrEqual(1000);
    });
  });
});
