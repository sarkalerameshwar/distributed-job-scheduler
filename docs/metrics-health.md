# Metrics and health

Phase 15 hardens observability: richer `/health`, Prometheus `/metrics` on API and worker, and HTTP/job counters.

## Health

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Aggregate status + dependency checks + `metrics` snapshot |
| `GET /health/live` | Process up (always 200 when process responds) |
| `GET /health/ready` | 200 only if MySQL + Redis are up (workers may be degraded) |

Checks:

- `mysql` / `redis` — ping latency
- `workers` — `ok` if ≥1 `ONLINE` worker, else `degraded` (`no_online_workers`)

Optional `metrics` on `/health`:

```json
{
  "workersOnline": 1,
  "workersFailed": 0,
  "workersTotal": 2,
  "jobsByStatus": { "QUEUED": 3, "RUNNING": 1 },
  "queueDepth": 5,
  "jobsRunning": 1,
  "openDlq": 0,
  "httpRequestsTotal": 42
}
```

## Prometheus (`GET /metrics`)

API exposes scrape-friendly text including:

| Metric | Type | Meaning |
|--------|------|---------|
| `djs_process_up` | gauge | API alive |
| `djs_mysql_up` / `djs_redis_up` | gauge | Dependency ping |
| `djs_jobs{status=…}` | gauge | Job counts |
| `djs_queue_depth` / `djs_jobs_running` / `djs_dlq_open` | gauge | Workload |
| `djs_workers{status=…}` | gauge | Worker registry |
| `djs_http_requests_total{method,route,status}` | counter | HTTP traffic |
| `djs_http_request_duration_ms_*` | summary | Latency samples |
| `djs_realtime_events_published_total{type}` | counter | Socket bus |
| `djs_job_events_total{status}` | counter | Job transition publishes |

Worker (`:3001/metrics`):

| Metric | Meaning |
|--------|---------|
| `djs_worker_up` | Process not draining |
| `djs_worker_active_jobs` | In-flight |
| `djs_worker_claims_total` / `_completions_total` / `_failures_total` | Lifecycle |
| `djs_worker_dlq_moves_total` / `_recoveries_total` / `_heartbeats_total` | Reliability |

DB gauges are cached ~2s per scrape to avoid hammering MySQL.

## Dashboard

Home page shows the health strip (including workers) and a compact platform metrics bar with a link to `/metrics`.
