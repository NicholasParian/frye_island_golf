# syntax=docker/dockerfile:1.6
# Build and run the Node API (Fastify + Prisma)
# Use the full `bookworm` image (not `-slim`) so OpenSSL + ca-certificates are present without `apt-get`
# during build. That avoids failures when the builder cannot reach deb.debian.org (DNS / corporate proxy).
FROM node:22-bookworm AS base

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
