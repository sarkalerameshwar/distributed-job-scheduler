# Testing

Phase 16 consolidates automated verification: unit suites, MySQL-backed e2e, and GitHub Actions CI.

## Commands

```bash
npm run typecheck
npm run test           # unit tests (shared-types, api, worker)
npm run test:e2e       # API + worker e2e (requires MySQL + Redis)
npm run test:ci        # typecheck + unit + e2e
```

Local e2e expects infra from `npm run docker:infra` (MySQL on **3308** by default via `.env`). CI uses MySQL on **3306** via `DATABASE_URL`.

Prefer stopping the worker (or `WORKER_DISABLE_CLAIM=true`) before worker claim-concurrency stress so a live process does not steal jobs.

## Suite inventory

### Unit

| Package | Focus |
|---------|--------|
| `@djs/shared-types` | Retry delay math, cron next-run |
| `@djs/api` | Env validation, password policy, RBAC helpers, job state machine, slug/duration, metrics rendering |
| `@djs/worker` | Task executor, retry wrapper, env validation, worker Prometheus counters |

### E2E (API)

Auth, orgs/queues, jobs, executions, retry policies, scheduling, DLQ, workers, dashboard, realtime Socket.IO, health/metrics.

### E2E (worker)

Atomic claim concurrency, stale-worker recovery.

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml):

1. **unit** — `npm ci`, Prisma generate, typecheck, unit tests  
2. **e2e** — MySQL 8.4 + Redis services, migrate deploy, `npm run test:e2e`

## Critical paths covered

- Auth register/login/refresh
- Job create → claim race under concurrency
- Retry/backoff preview + exhausted → DLQ
- Heartbeat timeout recovery
- Socket.IO auth + org room fan-out
- Prometheus `/metrics` exposition
