# =============================================================================
# Dockerfile pour les applications HA/MQTT
# Basé sur Node.js 20 Alpine
# =============================================================================

# Étape 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json pnpm-lock.yaml ./

# Installer pnpm et les dépendances
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copier la configuration TypeScript
COPY tsconfig.json ./

# Copier les sources
COPY src/ ./src/

# Builder l'application
RUN pnpm build

# Étape 2: Runtime
FROM node:20-alpine AS runtime

WORKDIR /app

# Configurer l'environnement
ENV NODE_ENV=production

# Copier les fichiers de dépendances
COPY package.json pnpm-lock.yaml ./

# Installer uniquement les dépendances de production
RUN npm install -g pnpm && pnpm install --frozen-lockfile --prod

# Copier l'application compilée
COPY --from=builder /app/dist ./dist

# Créer les dossiers persistants
RUN mkdir -p /app/data /app/logs

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:8080/health || exit 1

# Commande par défaut
CMD ["node", "dist/index.js"]
