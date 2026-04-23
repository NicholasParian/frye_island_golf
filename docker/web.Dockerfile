# syntax=docker/dockerfile:1.6
# Build static web app, serve via nginx (proxies /v1 to API in compose, optionality under a path prefix)
FROM node:22-bookworm-slim AS build

WORKDIR /app

ARG VITE_PUBLIC_PATH_PREFIX=
ENV VITE_PUBLIC_PATH_PREFIX=$VITE_PUBLIC_PATH_PREFIX

ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/

RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm set progress false \
    && npm set maxsockets 5 \
    && npm ci --ignore-scripts --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

RUN npm run build -w @fig/shared
RUN npm run build -w @fig/web

FROM nginx:1.27-alpine

ARG PUBLIC_PATH_PREFIX=
COPY docker/nginx.default.conf /opt/default.conf
COPY docker/nginx.prefixed.conf /opt/prefixed.conf
RUN PFX=""; \
  if [ -n "$PUBLIC_PATH_PREFIX" ]; then PFX="${PUBLIC_PATH_PREFIX#/}"; export PFX; fi; \
  if [ -z "$PFX" ]; then \
  cp /opt/default.conf /etc/nginx/conf.d/default.conf; \
  else \
  sed "s|__PFX__|${PFX}|g" /opt/prefixed.conf > /etc/nginx/conf.d/default.conf; \
  fi; \
  rm -f /opt/*.conf
COPY --from=build /app/apps/web/dist /tmp/app-dist
RUN PFX=""; \
  if [ -n "$PUBLIC_PATH_PREFIX" ]; then PFX="${PUBLIC_PATH_PREFIX#/}"; export PFX; fi; \
  if [ -z "$PFX" ]; then \
  cp -a /tmp/app-dist/. /usr/share/nginx/html/; \
  else \
  mkdir -p "/usr/share/nginx/html/${PFX}"; \
  cp -a /tmp/app-dist/. "/usr/share/nginx/html/${PFX}/"; \
  fi; \
  rm -rf /tmp/app-dist

EXPOSE 80
