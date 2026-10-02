FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:server

FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-slim
LABEL org.opencontainers.image.title="Zedgerr" \
      org.opencontainers.image.description="Invoicing, time tracking and bookkeeping for freelancers and small businesses" \
      org.opencontainers.image.licenses="FSL-1.1-ALv2"
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY package.json ./
COPY migrations/ ./migrations/
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/zedgerr-entrypoint

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["zedgerr-entrypoint"]
CMD ["node", "dist-server/server/index.js"]
