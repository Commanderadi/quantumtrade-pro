# syntax=docker/dockerfile:1

# ---- Build the frontend -------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- Install production backend dependencies ----------------------------
FROM node:22-alpine AS api-deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---- Runtime image ------------------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=5000 \
    STATIC_DIR=/app/public
WORKDIR /app
COPY --from=api-deps /app/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY --from=web /web/dist ./public
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "src/server.js"]
