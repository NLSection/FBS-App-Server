# syntax=docker/dockerfile:1.6
# FBS server image. Multi-stage: build with full toolchain, runtime is slim.
# Uses Next.js standalone output (already enabled in next.config.ts).

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DB_PATH=/data/fbs.db

RUN groupadd -g 1001 fbs \
 && useradd -u 1001 -g fbs -s /bin/bash -m fbs \
 && mkdir -p /data \
 && chown -R fbs:fbs /data

COPY --from=build --chown=fbs:fbs /app/.next/standalone ./
COPY --from=build --chown=fbs:fbs /app/.next/static ./.next/static
COPY --from=build --chown=fbs:fbs /app/public ./public

USER fbs
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
