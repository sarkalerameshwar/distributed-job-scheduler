# Scheduling and recurring jobs

Phase 11 replaces the UTC-09:00 placeholder with real **5-field cron** evaluation (via `cron-parser`), IANA timezones, and schedule management APIs.

## Schedule types

| Type | Created by job `type` | Behavior |
|------|------------------------|----------|
| `DELAY` | `DELAYED` | Fire once at `scheduledAt` / `now+delayMs` |
| `ONE_TIME` | `SCHEDULED` | Fire once at absolute `scheduledAt` |
| `CRON` | `RECURRING` | Reschedule after each successful run using `cronExpression` + `timezone` |

Definitions live in `scheduled_jobs` (separate from attempt history). The job row is reused for CRON occurrences; `JobExecution` still records every run.

## Next-run calculation

Shared helpers in `@djs/shared-types`:

- `isValidCronExpression` / `isValidIanaTimezone`
- `getNextCronRun(expression, { from, timezone })`
- `getNextCronRuns(expression, count, { from, timezone })`

Worker promote path still moves due `jobs.status=SCHEDULED` with `scheduledAt <= now` into `QUEUED`. After a CRON success, the worker writes the next `nextRunAt` / `scheduledAt` from the expression. DELAY / ONE_TIME schedules are deactivated after success. CRON schedules are paused when a job lands in DLQ (until operator retry).

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/schedules?organizationId=` | Filters: `active`, `scheduleType`, `projectId`, `queueId` |
| GET | `/schedules/:id` | |
| POST | `/schedules/:id/pause` | MEMBER+ |
| POST | `/schedules/:id/resume` | MEMBER+; recomputes next CRON fire |
| PATCH | `/schedules/:id` | ADMIN+; CRON expression / timezone / active |
| POST | `/schedules/preview` | Next N fire times without persisting |

## UI

`/schedules` — list org schedules, pause/resume, cron preview.
