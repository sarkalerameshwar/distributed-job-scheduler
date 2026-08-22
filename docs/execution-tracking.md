# Execution tracking

Phase 8 makes **attempt history** first-class. `jobs.status` answers “what is this job doing now?”; `job_executions` + `job_logs` answer “what happened on each try?”

## Principles

1. Every claim creates a `JobExecution` (`CLAIMED` → `RUNNING` → terminal).
2. Manual retry / DLQ re-queue / CRON reschedule **never deletes** prior executions.
3. `jobs.attempts` is a **per-cycle** counter (reset on CRON success or operator retry) used for `maxAttempts`.
4. `job_executions.attemptNumber` is **monotonic** (`max+1` on claim) so unique `(jobId, attemptNumber)` survives those resets.
5. Cancel closes open attempts as `CANCELLED` (API + cooperative worker check).
6. Logs are append-only and preferably tied to an `executionId`.

## Execution statuses

| Status | Meaning |
|--------|---------|
| `CLAIMED` | Worker won the row; not running yet |
| `RUNNING` | Handler in flight |
| `COMPLETED` | Handler returned; `result` JSON stored |
| `FAILED` | Handler threw / returned failure |
| `TIMEOUT` | `AbortController` fired |
| `CANCELLED` | User cancel or cooperative abort |

## API

- `GET /jobs/:id/executions` — summaries (`hasResult`, error code/message, worker identity)
- `GET /jobs/:id/executions/:executionId` — result, stack, linked logs
- `GET /jobs/:id/logs?executionId=&level=` — filtered stream

## Retention

`JOB_LOG_RETENTION_DAYS` (env) documents the intended cleanup window. Heartbeat/log pruning runs in the worker; execution rows themselves are business history and are not auto-deleted.
