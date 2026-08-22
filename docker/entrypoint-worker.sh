#!/bin/sh
set -e
echo "Waiting for MySQL..."
/wait-for.sh "${DB_HOST:-mysql}:${DB_PORT:-3306}" 90
echo "Waiting for Redis..."
/wait-for.sh "${REDIS_HOST:-redis}:${REDIS_PORT:-6379}" 60
echo "Starting worker (id=${WORKER_ID:-auto})..."
exec node apps/worker/dist/main.js
