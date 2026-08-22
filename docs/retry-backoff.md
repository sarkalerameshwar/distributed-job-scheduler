# Retry and backoff

Canonical write-up of FIXED / LINEAR / EXPONENTIAL behavior. Assignment alias: [retry-strategies.md](./retry-strategies.md).

Phase 9 formalizes automatic retries after a failed or timed-out execution.

## Strategies

| Strategy | Formula (attempt = failed attempt number, 1-based) |
|----------|-----------------------------------------------------|
| `FIXED` | `initialDelayMs` |
| `LINEAR` | `initialDelayMs * attempt` |
| `EXPONENTIAL` | `initialDelayMs * multiplier^(attempt - 1)` |

Every delay is floored to an integer and **capped** at `maxDelayMs`.

Optional `jitterRatio` ∈ `[0, 1]` blends in randomness to reduce synchronized retries (full jitter when `1`). Previews use a fixed RNG of `0.5` so schedules are stable.

Shared implementation: `calculateRetryDelay` / `buildRetrySchedule` in `@djs/shared-types`.

## Runtime flow

1. Worker finishes an attempt as `FAILED` or `TIMEOUT` on `job_executions`.
2. If `attempts < maxAttempts`, job becomes `RETRYING` with `nextRetryAt = now + delay`.
3. Worker poll promotes due `RETRYING` rows to `QUEUED`, then claims again (new execution row).
4. If attempts are exhausted → `DLQ` + `dead_letter_jobs` (see [dlq.md](./dlq.md)).

`maxAttempts` on a job defaults from its retry policy when omitted at create time.

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/retry-policies?organizationId=` | List |
| GET | `/retry-policies/:id` | Detail |
| POST | `/retry-policies` | ADMIN+ |
| PATCH | `/retry-policies/:id` | ADMIN+ |
| POST | `/retry-policies/preview` | Schedule preview (`policyId` or inline params) |

## Manual retry

`POST /jobs/:id/retry` re-queues `FAILED` / `DLQ` / `CANCELLED` jobs without deleting prior executions. That path is operator-driven and bypasses automatic backoff.
