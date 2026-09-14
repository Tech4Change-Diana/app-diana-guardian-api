# DIANA guardian-api — imagem multi-stage para OCI Container Instances (§2.5).
# Servidor de LONGA DURAÇÃO (≠ núcleo): escuta em PORT, sem `--once`.

# --- build ---
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# --- runtime ---
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Usuário não-root (o `node` já existe na imagem oficial).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 8080
# GET /health serve readiness/liveness da Container Instance.
ENTRYPOINT ["node", "dist/main.js"]
