FROM node:20-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS server-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY api/ ./api/
COPY server/ ./server/
RUN npx tsc -p tsconfig.server.json --noEmit false

# ── Stage 3: production runtime ───────────────────────────────────────────────
FROM node:20-slim
WORKDIR /app

# Native deps (better-sqlite3 needs them)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --ignore-scripts=false

# Rebuild native modules for this architecture
RUN npm rebuild better-sqlite3

COPY --from=frontend /app/dist ./dist
COPY --from=server-build /app/dist-server ./dist-server
COPY migrations/ ./migrations/

# Data volume: SQLite DB + uploaded files
VOLUME ["/app/data"]

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist-server/server/index.js"]
