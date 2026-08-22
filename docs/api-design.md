# API design

Base path: `/api/v1`. Health endpoints are unprefixed (`/health`, `/health/live`, `/health/ready`).

Authenticated routes expect `Authorization: Bearer <accessToken>`.

Error envelope:

```json
{
  "success": false,
  "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid email or password", "details": {} },
  "requestId": "..."
}
```

Success envelope (auth and user routes):

```json
{ "success": true, "data": {} }
```

## Auth

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| POST | `/auth/register` | no | Rate limited. Password policy 422 `PASSWORD_POLICY`. Duplicate email 409 `EMAIL_TAKEN`. |
| POST | `/auth/login` | no | Rate limited. Unknown email and bad password both 401 `INVALID_CREDENTIALS`. |
| POST | `/auth/refresh` | no | Body `{ "refreshToken" }`. Rotates the refresh token. Reuse of the old token fails. |
| POST | `/auth/logout` | bearer | Revokes the given refresh token, or all sessions for the user if omitted. |
| GET | `/auth/me` | bearer | User plus organization memberships (roles). |
| GET | `/users/me` | bearer | Same payload as `/auth/me`. |

Access JWT (`typ=access`) is short-lived. Refresh JWT (`typ=refresh`) is stored as SHA-256 in `refresh_tokens` so logout and rotation are enforceable. The JWT signature is not enough to stay logged in after revoke.

## RBAC (enforced on org-scoped routes from Phase 4)

Roles: `VIEWER` < `MEMBER` < `ADMIN` < `OWNER`.

## Organizations, projects, queues

| Method | Path | Min role | Notes |
|--------|------|----------|--------|
| POST | `/organizations` | authenticated | Caller becomes OWNER. Default retry policies are created. |
| GET | `/organizations` | member of returned orgs | Paginated. |
| GET | `/organizations/:id` | VIEWER | |
| PATCH | `/organizations/:id` | ADMIN | |
| GET | `/projects` | VIEWER of filter org | `?organizationId=&status=&page=` |
| POST | `/projects` | ADMIN | Unique slug per org. |
| GET | `/projects/:id` | VIEWER | |
| PATCH | `/projects/:id` | ADMIN | Archive via `status=ARCHIVED`. |
| GET | `/queues` | VIEWER | `?projectId=&organizationId=&status=` |
| POST | `/queues` | ADMIN | Unique name per project. Retry policy must belong to the same org. |
| GET | `/queues/:id` | VIEWER | |
| PATCH | `/queues/:id` | ADMIN | Configuration only. |
| POST | `/queues/:id/pause` | ADMIN | Running jobs may finish; workers skip paused queues when claiming. |
| POST | `/queues/:id/resume` | ADMIN | |
| POST | `/queues/:id/archive` | ADMIN | Sets `DISABLED`. History is kept. |
| GET | `/queues/:id/stats` | VIEWER | Status counts, depth, hourly throughput, avg duration. |
| GET | `/retry-policies?organizationId=` | VIEWER | |
| GET | `/retry-policies/:id` | VIEWER | |
| POST | `/retry-policies` | ADMIN | `maxDelayMs >= initialDelayMs`. |
| PATCH | `/retry-policies/:id` | ADMIN | |
| POST | `/retry-policies/preview` | VIEWER | FIXED/LINEAR/EXPONENTIAL schedule. Body: `policyId` **or** inline params. |

## Schedules (Phase 11)

| Method | Path | Min role | Notes |
|--------|------|----------|--------|
| GET | `/schedules?organizationId=` | VIEWER | Filters: `active`, `scheduleType`, `projectId`, `queueId` |
| GET | `/schedules/:id` | VIEWER | |
| POST | `/schedules/:id/pause` | MEMBER | Sets `active=false` |
| POST | `/schedules/:id/resume` | MEMBER | Recomputes CRON `nextRunAt` |
| PATCH | `/schedules/:id` | ADMIN | CRON expression / timezone / active |
| POST | `/schedules/preview` | authenticated | Next N fire times |

See [scheduling.md](./scheduling.md).

## Dead letter queue (Phase 10)

| Method | Path | Min role | Notes |
|--------|------|----------|--------|
| GET | `/dlq?organizationId=` | VIEWER | Filters: `projectId`, `queueId`, `resolved` |
| GET | `/dlq/:id` | VIEWER | Final execution detail (stack/result) |
| POST | `/dlq/:id/retry` | MEMBER | Re-queue / re-schedule; marks `RETRIED` |
| POST | `/dlq/:id/discard` | MEMBER | Optional `{ note }`; marks `DISCARDED` |
| POST | `/dlq/:id/resolve` | MEMBER | Optional `{ note }`; marks `RESOLVED` |

See [dlq.md](./dlq.md).

## Workers (Phase 12)

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/workers?status=` | bearer | Platform-wide worker registry |
| GET | `/workers/:id` | bearer | By cuid or public `workerId`; recent heartbeats |

See [heartbeat-recovery.md](./heartbeat-recovery.md).

## Dashboard (Phase 13)

| Method | Path | Min role | Notes |
|--------|------|----------|--------|
| GET | `/dashboard/overview?organizationId=` | VIEWER | KPIs, queue health, throughput series, failures, DLQ preview |

See [dashboard.md](./dashboard.md).

## Realtime (Phase 14)

Socket.IO namespace `/realtime` (path `/socket.io`). Authenticate with access JWT via `auth.token`. Subscribe with `subscribe.org`. Events: `job.updated`, `queue.updated`, `dlq.updated`, `dashboard.refresh`, `worker.updated`.

See [realtime.md](./realtime.md).

## Health & metrics (Phase 15)

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/health` | no | Checks + optional `metrics` snapshot |
| GET | `/health/live` | no | Liveness |
| GET | `/health/ready` | no | MySQL + Redis required |
| GET | `/metrics` | no | Prometheus text (API) |
| GET | `http://worker:3001/metrics` | no | Prometheus text (worker) |

See [metrics-health.md](./metrics-health.md).

Pagination: `?page=1&limit=20` (max 100). Never unbounded.

## Jobs (Phase 5)

| Method | Path | Min role | Notes |
|--------|------|----------|--------|
| POST | `/jobs` | MEMBER | Immediate / delayed / scheduled / recurring. Optional `Idempotency-Key` header. Rate limited. |
| POST | `/jobs/batch` | MEMBER | Atomic batch insert (max 100). |
| GET | `/jobs` | VIEWER | Filters: `queueId`, `projectId`, `organizationId`, `status`, `taskType`, `priority`, `createdFrom`, `createdTo`, sort. |
| GET | `/jobs/:id` | VIEWER | Includes schedule when present. |
| POST | `/jobs/:id/cancel` | MEMBER | From QUEUED / SCHEDULED / RETRYING / CLAIMED. |
| POST | `/jobs/:id/retry` | MEMBER | From FAILED / DLQ / CANCELLED → QUEUED (history preserved). |
| GET | `/jobs/:id/executions` | VIEWER | Attempt history (`JobExecution`). Status/duration/error summary. |
| GET | `/jobs/:id/executions/:executionId` | VIEWER | Full attempt: result JSON, error stack, linked logs. |
| GET | `/jobs/:id/logs` | VIEWER | Optional `?executionId=&level=`. |

`taskType` is constrained to the controlled registry (`send_email`, `test_failure`, …). Arbitrary code is never accepted.

Job status is a **current-state cache**. Attempt audit history always lives in `JobExecution` / `JobLog`. Cancel closes open `CLAIMED`/`RUNNING` executions as `CANCELLED`.

