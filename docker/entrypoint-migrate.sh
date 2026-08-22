#!/bin/sh
set -e
echo "Waiting for MySQL..."
/wait-for.sh "${DB_HOST:-mysql}:${DB_PORT:-3306}" 90
echo "Running Prisma migrations..."
npx prisma migrate deploy
echo "Migrations complete."
