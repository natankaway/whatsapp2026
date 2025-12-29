# =============================================================================
# CT LK FUTEVÔLEI - WHATSAPP BOT
# =============================================================================
# Multi-stage build otimizado para produção
# =============================================================================

# -----------------------------------------------------------------------------
# STAGE 1: Build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Instalar dependências de build para melhor-sqlite3
RUN apk add --no-cache python3 make g++ sqlite-dev

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
COPY tsconfig.json ./

# Instalar todas as dependências (incluindo devDependencies)
RUN npm ci

# Copiar código fonte
COPY src ./src

# Compilar TypeScript
RUN npm run build

# Remover devDependencies
RUN npm prune --production

# -----------------------------------------------------------------------------
# STAGE 2: Production
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Instalar apenas runtime dependencies
RUN apk add --no-cache sqlite-libs dumb-init

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copiar artefatos do builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Criar diretórios de dados
RUN mkdir -p data backups logs auth_info && \
    chown -R nodejs:nodejs data backups logs auth_info

# Definir variáveis de ambiente
ENV NODE_ENV=production
ENV HEALTH_PORT=3000

# Expor porta de health check
EXPOSE 3000

# Usar usuário não-root
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Usar dumb-init para gerenciamento de sinais
ENTRYPOINT ["dumb-init", "--"]

# Comando de inicialização
CMD ["node", "dist/index.js"]
