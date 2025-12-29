import { z } from 'zod';

// Schemas de validação com Zod
export const phoneSchema = z.string().regex(/^\d{11,13}$/, 'Telefone inválido');

export const timeSchema = z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Horário inválido');

export const fullNameSchema = z
  .string()
  .min(3, 'Nome muito curto')
  .refine((name) => name.trim().split(' ').length >= 2, 'Digite nome e sobrenome');

// Funções de validação
export const validators = {
  isValidPhone: (phone: string): boolean => {
    const cleaned = phone.replace(/\D/g, '');
    return phoneSchema.safeParse(cleaned).success;
  },

  isValidDate: (date: unknown): date is Date => {
    return date instanceof Date && !isNaN(date.getTime());
  },

  isValidTime: (time: string): boolean => {
    return timeSchema.safeParse(time).success;
  },

  isFullName: (name: string): boolean => {
    return fullNameSchema.safeParse(name).success;
  },

  sanitizeName: (name: string): string => {
    return name
      .trim()
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .substring(0, 100);
  },

  sanitizeText: (text: string): string => {
    return text.trim().replace(/[<>]/g, '').substring(0, 1000);
  },

  isGroupId: (id: string): boolean => {
    return id.endsWith('@g.us');
  },

  isPrivateId: (id: string): boolean => {
    return id.endsWith('@s.whatsapp.net');
  },

  parsePhoneFromJid: (jid: string): string => {
    return jid.split('@')[0] ?? jid;
  },
};

export default validators;
