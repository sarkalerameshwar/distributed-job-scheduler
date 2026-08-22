#!/bin/sh
# Usage: wait-for.sh host:port [timeout_seconds]
set -e
TARGET="${1:?host:port required}"
TIMEOUT="${2:-60}"
HOST="${TARGET%:*}"
PORT="${TARGET#*:}"

i=0
while [ "$i" -lt "$TIMEOUT" ]; do
  if nc -z "$HOST" "$PORT" >/dev/null 2>&1; then
    echo "ready: $TARGET"
    exit 0
  fi
  i=$((i + 1))
  sleep 1
done

echo "timeout waiting for $TARGET (${TIMEOUT}s)" >&2
exit 1
