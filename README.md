# 🏐 Bot WhatsApp CT LK Futevôlei

Bot profissional de atendimento automático via WhatsApp para o CT LK Futevôlei, desenvolvido em **TypeScript** com **Baileys v7.0.0-rc.9**.

## ✨ Características

- ⚡ **Baileys v7.0.0-rc.9** - Versão mais recente da biblioteca
- 📦 **TypeScript** - Tipagem forte e segura
- 🏗️ **Arquitetura Limpa** - Separação clara de responsabilidades
- 🔌 **Sistema de Eventos** - Manipulação de eventos desacoplada
- 🎯 **Comandos Modulares** - Fácil adicionar novos comandos
- 🛡️ **Middlewares** - Rate limiting e validações
- 📝 **Logger Profissional** - Pino com rotação de logs
- 🔄 **Reconexão Automática** - Recuperação de falhas
- 📊 **Enquetes Agendadas** - Sistema de polls automáticos
- 🤖 **Integração Telegram** - Notificações e gestão de agenda

## 📁 Estrutura do Projeto

```
src/
├── index.ts              # Entrada principal
├── config/
│   └── index.ts          # Configurações centralizadas
├── types/
│   └── index.ts          # Definições de tipos TypeScript
├── utils/
│   ├── index.ts          # Exportações de utils
│   ├── logger.ts         # Sistema de logs (Pino)
│   ├── sessionManager.ts # Gerenciamento de sessões
│   ├── pauseManager.ts   # Controle de pausa do bot
│   ├── storage.ts        # Persistência de dados
│   ├── validators.ts     # Validadores (Zod)
│   └── messageHelpers.ts # Helpers de mensagens
├── services/
│   ├── index.ts          # Exportações de serviços
│   ├── whatsapp.ts       # Serviço WhatsApp (Baileys)
│   ├── telegram.ts       # Serviço Telegram
│   └── notification.ts   # Notificações
├── events/
│   ├── index.ts          # Exportações de eventos
│   ├── eventEmitter.ts   # Sistema de eventos
│   └── messageHandler.ts # Handler de mensagens
├── handlers/
│   ├── index.ts          # Exportações de handlers
│   ├── menuHandler.ts    # Lógica de menu
│   ├── bookingHandler.ts # Agendamentos
│   ├── groupHandler.ts   # Mensagens de grupo
│   └── pollHandler.ts    # Enquetes
├── commands/
│   ├── index.ts          # Exportações de comandos
│   ├── loader.ts         # Carregador de comandos
│   ├── ping.ts           # Comando ping
│   └── menu.ts           # Comando menu
└── middlewares/
    ├── index.ts          # Exportações de middlewares
    └── rateLimit.ts      # Rate limiting
```

## 🚀 Instalação

```bash
# Clonar repositório
git clone [seu-repo]
cd whatsapp-bot-ts

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Edite o arquivo .env com suas configurações

# Compilar TypeScript
npm run build

# Iniciar em produção
npm start

# Ou em desenvolvimento (com hot reload)
npm run dev
```

## ⚙️ Configuração

Edite o arquivo `.env` com suas configurações:

```env
# Telegram
TELEGRAM_RECREIO_TOKEN=seu_token
TELEGRAM_BANGU_TOKEN=seu_token
TELEGRAM_NOTIFICATION_CHAT_IDS=123456,789012

# WhatsApp Groups
WHATSAPP_RECREIO_GROUP=120363208643524067@g.us
WHATSAPP_BANGU_GROUP=120363419544998924@g.us

# Logs
LOG_LEVEL=info
```

## 📱 Comandos Disponíveis

### Chat Privado
| Comando | Descrição |
|---------|-----------|
| `menu` | Menu principal |
| `1-9` | Opções do menu |
| `ping` | Verificar status |

### Grupos
| Comando | Descrição |
|---------|-----------|
| `@bot ajuda` | Lista de comandos |
| `@bot unidades` | Informações das unidades |
| `@bot horarios` | Horários das aulas |
| `@bot valores` | Preços e planos |
| `@bot enquete recreio` | Criar enquete |

## 🔧 Scripts NPM

```bash
npm run build      # Compilar TypeScript
npm start          # Executar em produção
npm run dev        # Desenvolvimento com hot reload
npm run lint       # Verificar código
npm run lint:fix   # Corrigir problemas
npm run format     # Formatar código
npm run clean      # Limpar build
```

## 🆕 Adicionando Novos Comandos

1. Crie um arquivo em `src/commands/`:

```typescript
// src/commands/exemplo.ts
import type { Command } from '../types/index.js';
import { sendText } from '../utils/messageHelpers.js';

const exemploCommand: Command = {
  name: 'exemplo',
  aliases: ['ex', 'teste'],
  description: 'Comando de exemplo',
  category: 'menu',
  isPrivateOnly: true,

  async execute(ctx): Promise<void> {
    await sendText(ctx.sock, ctx.from, 'Olá! Este é um comando de exemplo.');
  },
};

export default exemploCommand;
```

2. O comando será carregado automaticamente pelo `CommandLoader`.

## 📊 Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                      index.ts                            │
│                   (Bootstrapper)                         │
└─────────────────────────┬───────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌─────────────────┐ ┌───────────┐ ┌─────────────────┐
│ WhatsAppService │ │ Telegram  │ │ CommandLoader   │
│   (Baileys v7)  │ │  Service  │ │                 │
└────────┬────────┘ └───────────┘ └─────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    EventEmitter                          │
└─────────────────────────┬───────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌─────────────────┐ ┌───────────┐ ┌─────────────────┐
│ MessageHandler  │ │   Group   │ │     Poll        │
│                 │ │  Handler  │ │    Handler      │
└────────┬────────┘ └───────────┘ └─────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              Handlers (Menu, Booking, etc.)              │
└─────────────────────────────────────────────────────────┘
```

## 🔒 Segurança

- Rate limiting para prevenir spam
- Validação de entrada com Zod
- Sanitização de nomes e textos
- Sessões com timeout automático
- Tratamento de erros robusto

## 📝 Logs

Os logs são salvos em:
- `logs/combined.log` - Todas as operações
- `logs/error.log` - Apenas erros

Em desenvolvimento, os logs são exibidos no console com cores.

## 🤝 Contribuição

1. Fork o projeto
2. Crie sua branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📄 Licença

MIT

## 📞 Suporte

CT LK Futevôlei - Recreio e Bangu
