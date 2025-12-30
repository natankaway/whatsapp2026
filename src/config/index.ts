import 'dotenv/config';
import path from 'path';
import type { AppConfig } from '../types/index.js';

const CONFIG: AppConfig = {
  empresa: {
    nome: 'CT LK Futevôlei',
    esporte: 'Futevôlei',
    horarioAtendimento: {
      inicio: '06:00',
      fim: '22:00',
      diasUteis: [1, 2, 3, 4, 5, 6],
    },
  },

  telegram: {
    recreioToken: process.env.TELEGRAM_RECREIO_TOKEN ?? '',
    banguToken: process.env.TELEGRAM_BANGU_TOKEN ?? '',
    notificationChatIds: process.env.TELEGRAM_NOTIFICATION_CHAT_IDS?.split(',') ?? [],
    authorizedUserIds: (process.env.TELEGRAM_AUTHORIZED_USER_IDS?.split(',') ?? [])
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id)),
  },

  gruposWhatsApp: {
    recreio: process.env.WHATSAPP_RECREIO_GROUP ?? '120363208643524067@g.us',
    bangu: process.env.WHATSAPP_BANGU_GROUP ?? '120363419544998924@g.us',
  },

  paths: {
    data: path.join(process.cwd(), 'data'),
    backups: path.join(process.cwd(), 'backups'),
    logs: path.join(process.cwd(), 'logs'),
    auth: path.join(process.cwd(), 'auth_info'),
  },

  jsonFilePaths: {
    recreio: path.join(process.cwd(), 'data', 'agenda_recreio.json'),
    bangu: path.join(process.cwd(), 'data', 'agenda_bangu.json'),
  },

  unidades: [
    {
      id: 1,
      nome: 'Unidade Recreio',
      endereco:
        'Praia do Recreio, Posto 11 - Em frente ao Hotel Atlântico Sul, ao lado do Quiosque Vitória',
      local: 'Recreio dos Bandeirantes',
      diasFuncionamento: 'Segunda a Sexta',
      horarios: ['17:30 às 18:30', '18:30 às 19:30', '19:30 às 20:30'],
      aulaoSabado: 'Sábado: Aulão das 7h às 8h',
      precos: {
        mensalidade: [
          { frequencia: '1x por semana', valor: 'R$ 100,00' },
          { frequencia: '2x por semana', valor: 'R$ 150,00' },
          { frequencia: '3x por semana', valor: 'R$ 200,00' },
          { frequencia: '4x a 6x por semana', valor: 'R$ 250,00' },
        ],
        avulsa: 'R$ 30,00',
      },
      plataformas: ['Wellhub (Gympass)', 'TotalPass', 'GuruPass'],
    },
    {
      id: 2,
      nome: 'Unidade Califórnia - Jardim Bangu',
      endereco:
        'Rua Selene de Medeiros, 112 - Jardim Bangu (Quadra de areia do Condomínio Califórnia)',
      local: 'Bangu',
      diasFuncionamento: 'Segunda a Sexta',
      horarios: [],
      horariosTexto: [
        'SEGUNDA E SEXTA:',
        '  • 7h às 8h - Livre',
        '  • 8h às 9h - Livre',
        '  • 9h às 10h - Iniciantes',
        '  • 17h às 18h - Avançado',
        '  • 18h às 19h - Intermediário',
        '  • 19h às 20h - Iniciantes',
        '  • 20h às 21h - Livre',
        '',
        'QUARTA-FEIRA:',
        '  • 7h às 8h - Livre',
        '  • 8h às 9h - Livre',
        '  • 9h às 10h - Iniciantes',
        '  • 17h às 18h - Avançado',
        '  • 18h às 19h - Intermediário',
        '  • 19h às 20h - Iniciantes',
        '',
        'TERÇA E QUINTA:',
        '  • 19h às 20h - Intermediário',
        '  • 20h às 21h - Iniciantes',
        '  • 21h às 22h - Avançado',
      ],
      precos: {
        mensalidade: [
          { frequencia: '1x por semana', valor: 'R$ 100,00' },
          { frequencia: '2x por semana', valor: 'R$ 120,00' },
          { frequencia: '3x por semana', valor: 'R$ 150,00' },
          { frequencia: '5x por semana', valor: 'R$ 200,00' },
        ],
        avulsa: 'R$ 30,00',
      },
      plataformas: ['Wellhub (Gympass)', 'TotalPass', 'GuruPass'],
    },
  ],

  menuPrincipal: `
⚽ *CT LK FUTEVÔLEI - MENU PRINCIPAL* ⚡

Escolha uma opção:

1 - *Informações das Unidades*
2 - *Horários das Aulas*
3 - *Valores e Planos*
4 - *Agendar Aula Experimental*
5 - *Plataformas de Check-in*
6 - *Localização das Quadras*
7 - *Níveis das Turmas*
8 - *Dúvidas Frequentes*
9 - *Falar com Atendente*

Digite o número da opção ou *MENU* para ver novamente.
  `.trim(),

  faq: [
    {
      pergunta: 'Preciso saber jogar futebol ou vôlei para começar?',
      resposta:
        'Não é necessário! O futevôlei tem movimentos próprios. Ter experiência em futebol ou vôlei ajuda, mas ensinamos todos os fundamentos desde o início.',
    },
    {
      pergunta: 'Qual a diferença entre as turmas de níveis?',
      resposta:
        'Iniciantes: Para quem nunca jogou ou está começando. Intermediário: Já domina os fundamentos básicos e consegue manter sequências de jogo. Avançado: Jogadores experientes com técnica apurada.',
    },
    {
      pergunta: 'Como funciona o pagamento por plataforma?',
      resposta:
        'Você faz o check-in pelo app (Wellhub/Gympass, TotalPass ou GuruPass) antes da aula. Verifique se seu plano está nos requisitos mínimos do CT.',
    },
    {
      pergunta: 'As aulas acontecem com chuva?',
      resposta:
        'Sim, damos aula com chuva! Só cancelamos em casos extremos: chuva muito forte COM vento muito forte ou quando há raios. Nesses casos, avisaremos no grupo do WhatsApp sobre o cancelamento.',
    },
  ],

  nomesEnquetes: {
    segunda: ['Segunda de Treino ⚡', 'Segunda na Areia ⚡', 'Segunda de Futevôlei ⚡', 'SEGUNDOUUU ⚡'],
    terca: [
      'Terça de Treino ⚡',
      'Terça na Quadra ⚡',
      'Terça de Futevôlei ⚡',
      'Terça na Areia ⚡',
      'TERÇOUUU ⚡',
    ],
    quarta: ['Quarta de Treino ⚡', 'Quarta na Areia ⚡', 'Quarta de Futevôlei ⚡', 'QUARTOUUU ⚡'],
    quinta: [
      'Quinta de Treino ⚡',
      'Quinta na Quadra ⚡',
      'Quinta de Futevôlei ⚡',
      'Quinta na Areia ⚡',
      'QUINTOUUU ⚡',
    ],
    sexta: ['Sexta de Treino ⚡', 'Sexta na Areia ⚡', 'Sexta de Futevôlei ⚡', 'SEXTOUUU ⚡'],
    sabado: ['Aulão de Sábado 7H ⚡'],
  },

  rateLimit: {
    maxRequests: 10,
    windowMs: 60000,
  },

  session: {
    timeout: 30 * 60 * 1000, // 30 minutos
    cleanupInterval: 5 * 60 * 1000, // 5 minutos
  },

  reminder: {
    enabled: process.env.REMINDER_ENABLED !== 'false',
    reminder24h: process.env.REMINDER_24H !== 'false',
    reminder2h: process.env.REMINDER_2H !== 'false',
    confirmationRequired: process.env.REMINDER_CONFIRMATION_REQUIRED === 'true',
    confirmationDeadlineHours: parseInt(process.env.REMINDER_CONFIRMATION_DEADLINE ?? '2', 10),
  },
};

export default CONFIG;
