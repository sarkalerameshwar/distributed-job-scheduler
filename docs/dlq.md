# Dead letter queue (DLQ)

Phase 10 exposes operator APIs and a dashboard for jobs that exhausted retries.

## When a job enters DLQ

The worker (Phase 6/9) moves a job to `status=DLQ` when attempts are exhausted, then upserts `dead_letter_jobs`:

| Field | Meaning |
|-------|---------|
| `reason` | e.g. `max_attempts_exhausted` |
| `finalError` | Last error message |
| `attempts` | Attempt count at move time |
| `finalExecutionId` | Last `JobExecution` |
| `resolvedAt` / `resolution` | Null until an operator acts |

Recurring (`CRON`) schedules are **paused** on DLQ so a permanently failing job does not keep firing. Operator **retry** reactivates the schedule and sets the next run.

## Resolutions

| Resolution | Effect |
|------------|--------|
| `RETRIED` | Job re-queued (or re-scheduled for CRON); attempts reset; history kept |
| `DISCARDED` | DLQ row closed; job stays `DLQ` (no re-run) |
| `RESOLVED` | Same as discard but marked acknowledged |

Open entries have `resolvedAt = null`. A second action on a resolved row returns `422 DLQ_ALREADY_RESOLVED`.

## API

| Method | Path | Min role | Notes |
|--------|------|----------|--------|
| GET | `/dlq?organizationId=` | VIEWER | Filters: `projectId`, `queueId`, `resolved` (`true`/`false`) |
| GET | `/dlq/:id` | VIEWER | Includes final execution stack/result |
| POST | `/dlq/:id/retry` | MEMBER | Delegates to job retry; sets `RETRIED` |
| POST | `/dlq/:id/discard` | MEMBER | Body optional `{ note }`; sets `DISCARDED` |
| POST | `/dlq/:id/resolve` | MEMBER | Body optional `{ note }`; sets `RESOLVED` |

`POST /jobs/:id/retry` on a DLQ job still works and also marks the linked DLQ row `RETRIED`.

## UI

`/dlq` — filter open / resolved / all; retry, resolve, or discard per row; links to job detail.

## Consistency

- Job status remains the **current-state cache**; DLQ rows are the operator inbox.
- Worker upsert on re-entry clears `resolvedAt` / `resolution` so a job that fails again after retry reappears as open.
