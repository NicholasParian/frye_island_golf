#!/bin/sh
set -e
cd /app/apps/api
npx prisma migrate deploy
# Idempotent: creates admin only if missing (see prisma/seed.ts). Set SKIP_DB_SEED=1 to skip.
if [ "${SKIP_DB_SEED:-0}" != "1" ]; then
  npx prisma db seed
fi
exec node dist/index.js
