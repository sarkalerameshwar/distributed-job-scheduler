# Distributed Job Scheduler

Production-inspired platform for running asynchronous background jobs across multiple workers.

**Status: complete (Phases 1–18)** — auth, queues, jobs, workers, retries/DLQ, schedules, dashboard, realtime, metrics, tests/CI, Docker, and documentation.

## Architecture

```
Browser (React / Vite)
        │ REST + Socket.IO
        ▼
   NestJS API  ── Prisma ── MySQL 8 (source of truth)
        │
        └── ioredis ── Redis 7 (realtime pub/sub + health)

   NestJS Worker (scalable process)
        ├── Prisma ── MySQL (claim / execute / heartbeat / recovery)
        └── ioredis ── Redis (publish realtime events + health)
```

Documentation hub: **[docs/README.md](docs/README.md)**  
Key docs: [architecture](docs/architecture.md) · [database](docs/database-design.md) · [API](docs/api-design.md) · [concurrency](docs/concurrency.md) · [reliability](docs/reliability.md) · [design decisions](docs/design-decisions.md) · [deployment](docs/deployment.md)

## Prerequisites

- Node.js 20+
- npm 10+
- Docker / Docker Compose (MySQL on host port **3308**, Redis on **6379**)

## Quick start (local dev)

```bash
cp .env.example .env          # set JWT secrets (≥32 chars)
npm install
npm run docker:infra          # MySQL + Redis
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run dev                   # API :3000, worker :3001, web :5173
```

Seeded login: `admin@scheduler.local` / `Admin123!Dev`

## Quick start (Docker full stack)

```bash
cp .env.example .env
docker compose up -d --build
npm run docker:seed
```

| Service | URL |
|---------|-----|
| Web | http://localhost:5173 |
| API | http://localhost:3000 |
| Swagger | http://localhost:3000/docs |
| Worker health | http://localhost:3001/health |
| Prometheus | http://localhost:9090 (`--profile observability`) |
| Grafana | http://localhost:3002 (`admin`/`admin`) |

More: [docs/deployment.md](docs/deployment.md). Helpers: `npm run docker:up:obs`, `npm run docker:scale-workers`.

## Tests

```bash
npm run typecheck
npm run test              # unit
npm run test:e2e          # needs MySQL + Redis
npm run test:ci           # typecheck + unit + e2e
```

CI: `.github/workflows/ci.yml`. Details: [docs/testing.md](docs/testing.md).

## API exploration

- Swagger UI: `/docs`
- Postman: [postman/Distributed-Job-Scheduler.postman_collection.json](postman/Distributed-Job-Scheduler.postman_collection.json)
- Written reference: [docs/api-design.md](docs/api-design.md)

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| API exits immediately | `.env` missing or JWT secrets shorter than 32 characters |
| Readiness 503 | MySQL/Redis down or wrong `DATABASE_URL` / `REDIS_HOST` |
| Prisma P1001 | Wait for MySQL healthcheck; host port is **3308** |
| Frontend API errors (Docker) | Use web on :5173 (nginx proxies `/api` and `/socket.io`) |
| `docker compose` unknown | Install Compose plugin or use `docker-compose` |
| Worker port in use when scaling | Use `docker-compose.scale.yml` (clears host `:3001`) |

## Phase checklist

| Phase | Topic |
|-------|--------|
| 1 | Scaffolding, Compose infra, health |
| 2 | Database schema |
| 3 | Auth (JWT) |
| 4 | Organizations / projects / queues |
| 5 | Job lifecycle APIs |
| 6 | Worker service |
| 7 | Atomic claiming |
| 8 | Execution tracking |
| 9 | Retry / backoff |
| 10 | DLQ |
| 11 | Scheduling / cron |
| 12 | Heartbeat / stale recovery |
| 13 | Dashboard |
| 14 | WebSockets |
| 15 | Metrics / health |
| 16 | Testing / CI |
| 17 | Docker / deployment |
| 18 | Docs / polish |
