# Documentation index

Final documentation set for the Distributed Job Scheduler (Phase 18).

## Required (assignment layout)

| Doc | Topic |
|-----|--------|
| [architecture.md](./architecture.md) | System overview, components, worker loop |
| [database-design.md](./database-design.md) | ER diagram, keys, indexes, normalization |
| [api-design.md](./api-design.md) | REST + Socket.IO surface |
| [concurrency.md](./concurrency.md) | Atomic claim algorithm |
| [reliability.md](./reliability.md) | Heartbeats, recovery, shutdown, failure modes |
| [retry-strategies.md](./retry-strategies.md) | FIXED / LINEAR / EXPONENTIAL |
| [design-decisions.md](./design-decisions.md) | Major trade-offs |
| [deployment.md](./deployment.md) | Docker Compose, scale, observability |

## Topic deep-dives

| Doc | Topic |
|-----|--------|
| [retry-backoff.md](./retry-backoff.md) | Extended retry notes (same behavior as retry-strategies) |
| [execution-tracking.md](./execution-tracking.md) | Executions and logs |
| [scheduling.md](./scheduling.md) | Cron / delayed schedules |
| [dlq.md](./dlq.md) | Dead letter queue ops |
| [heartbeat-recovery.md](./heartbeat-recovery.md) | Stale worker recovery |
| [dashboard.md](./dashboard.md) | Ops overview UI/API |
| [realtime.md](./realtime.md) | Socket.IO + Redis bus |
| [rate-limit-dispatch.md](./rate-limit-dispatch.md) | Rate limits, Redis locks, dispatch wake |
| [metrics-health.md](./metrics-health.md) | Health + Prometheus |
| [testing.md](./testing.md) | Unit, e2e, CI |

## Other artifacts

- Interactive OpenAPI: `http://localhost:3000/docs` (Swagger)
- Postman collection: [postman/Distributed-Job-Scheduler.postman_collection.json](../postman/Distributed-Job-Scheduler.postman_collection.json)
- Root setup: [../README.md](../README.md)
