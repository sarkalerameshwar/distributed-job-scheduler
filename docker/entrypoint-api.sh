#!/bin/sh
set -e
echo "Waiting for MySQL..."
/wait-for.sh "${DB_HOST:-mysql}:${DB_PORT:-3306}" 90
echo "Waiting for Redis..."
/wait-for.sh "${REDIS_HOST:-redis}:${REDIS_PORT:-6379}" 60

if [ "${MIGRATE_ON_START:-false}" = "true" ]; then
  echo "Running Prisma migrations (MIGRATE_ON_START=true)..."
  npx prisma migrate deploy
fi

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "Seeding database (SEED_ON_START=true)..."
  npx tsx prisma/seed.ts
fi

echo "Starting API..."
exec node apps/api/dist/main.js
