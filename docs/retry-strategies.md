# Retry strategies

Assignment-facing name for retry/backoff behavior. Full detail: [retry-backoff.md](./retry-backoff.md).

## Strategies

| Name | Delay after failed attempt `n` (1-based) |
|------|------------------------------------------|
| **FIXED** | `initialDelayMs` |
| **LINEAR** | `initialDelayMs * n` |
| **EXPONENTIAL** | `initialDelayMs * multiplier^(n - 1)` |

All delays are capped at `maxDelayMs`. Optional `jitterRatio` ∈ `[0, 1]` reduces thundering herds (preview APIs use deterministic jitter `0.5`).

Policies are org-scoped (`retry_policies`). Queues pick a default; jobs may override `retryPolicyId` / `maxAttempts`.

## Lifecycle

```text
RUNNING → FAILED/TIMEOUT
       → attempts < maxAttempts → RETRYING (nextRetryAt)
       → worker promotes due RETRYING → QUEUED → claim → new JobExecution
       → attempts exhausted → DLQ + dead_letter_jobs
```

Shared math: `calculateRetryDelay` / `buildRetrySchedule` in `@djs/shared-types` (unit-tested).

## Operator overrides

- `POST /jobs/:id/retry` — re-queue without waiting for backoff (preserves history)
- DLQ `retry` / `discard` / `resolve` — [dlq.md](./dlq.md)

## API surface

| Method | Path |
|--------|------|
| GET | `/api/v1/retry-policies?organizationId=` |
| POST | `/api/v1/retry-policies` |
| PATCH | `/api/v1/retry-policies/:id` |
| POST | `/api/v1/retry-policies/preview` |

Default policies are seeded when an organization is created.
