# Deployment

Phase 17 hardened **Docker Compose** for a production-inspired local/staging stack: one-shot migrations, healthchecks, graceful stop, multi-worker scale, nginx WebSocket proxy, and an optional observability profile. Phase 18 keeps this document as the deployment source of truth.

## Quick start (full app stack)

```bash
cp .env.example .env   # set JWT secrets (≥32 chars)
docker compose up -d --build
docker compose run --rm --entrypoint /sbin/tini api -- npx tsx prisma/seed.ts   # once
```

| Service | URL |
|---------|-----|
| Web (nginx) | http://localhost:5173 |
| API | http://localhost:3000 |
| Swagger (via API or nginx) | http://localhost:3000/docs or http://localhost:5173/docs |
| Worker health | http://localhost:3001/health |
| MySQL (host) | localhost:**3308** |
| Redis (host) | localhost:**6379** |

Realtime Socket.IO works through nginx (`/socket.io` → API).

## Infra only (local `npm run dev`)

```bash
npm run docker:infra
# MySQL + Redis only; API/worker/web run on the host
```

## Observability profile

Prometheus + Grafana are **opt-in**:

```bash
docker compose --profile observability up -d
```

| Service | URL |
|---------|-----|
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3002 (`admin` / `admin` by default) |

A provisioned **DJS Overview** dashboard reads API/worker `/metrics`.

## Multi-worker scale

Host port `3001` can bind once. Scale with the overlay that clears published ports:

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml up -d --scale worker=3 --build
```

Each replica gets a unique `WORKER_ID` from hostname + pid. Prometheus still scrapes DNS name `worker:3001` (round-robin across replicas on the Compose network).

## Production-lean overlay

Do not publish MySQL/Redis (or worker) to the host:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile observability up -d --build
```

## Image layout

| Image | Dockerfile | Notes |
|-------|------------|--------|
| API / migrate | `docker/Dockerfile.api` | Non-root `djs` user, `tini`, wait-for MySQL/Redis |
| Worker | `docker/Dockerfile.worker` | Same; `stop_grace_period: 35s` for drain |
| Web | `docker/Dockerfile.web` | nginx proxies `/api`, `/health`, `/docs`, `/socket.io` |

Migrations run in the **`migrate`** one-shot service (`service_completed_successfully`) before API/worker start. Set `SEED_ON_START=true` on the API service only for disposable demo environments.

## Environment

Compose **overrides** `DATABASE_URL` / `REDIS_HOST` to Docker DNS (`mysql`, `redis`) even when `.env` points at `localhost` for host-side development.

Important variables: `JWT_*`, `MYSQL_*`, `CORS_ORIGIN`, `SHUTDOWN_GRACE_MS`, `WORKER_CONCURRENCY`.

## npm helpers

```bash
npm run docker:infra          # mysql + redis
npm run docker:up             # full stack build/up
npm run docker:up:obs         # + prometheus/grafana
npm run docker:down
npm run docker:seed           # seed against running stack
npm run docker:scale-workers  # 3 workers (scale overlay)
```

## Out of scope

TLS termination, external secrets managers, Kubernetes manifests, and multi-region failover are left for a real production deploy — this phase targets a reliable Compose delivery matching the assignment’s Docker/Compose requirement.
