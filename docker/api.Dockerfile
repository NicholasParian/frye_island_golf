# syntax=docker/dockerfile:1.6
# Build and run the Node API (Fastify + Prisma) — `bookworm-slim` is much smaller; Prisma still needs OpenSSL
# and TLS roots (install them below). If `apt-get` fails to resolve `deb.debian.org`, fix Docker DNS, or use
# a non-slim base for that environment only.
FROM node:22-bookworm-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Lighter, quieter installs; cache persist helps rebuilds. Serial npm jobs reduce peak RAM (important if building
# api+web in parallel on a small VM, which can OOM and surface as: npm "Exit handler never called").
ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm set progress false \
    && npm set maxsockets 5 \
    && npm ci --ignore-scripts --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build -w @fig/shared

WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build
WORKDIR /app

COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 4000

ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
