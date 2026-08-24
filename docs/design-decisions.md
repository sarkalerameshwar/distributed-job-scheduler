# Design decisions

Major trade-offs made while building the Distributed Job Scheduler. Each section states the choice, the alternatives considered, and why.

## 1. MySQL as source of truth (not Redis)

**Choice:** Job state, executions, schedules, DLQ, workers, and auth live in MySQL. Redis is ancillary.

**Alternatives:** Redis/BullMQ as primary queue; dual-write with Redis as hot path.

**Why:** Durable audit history, relational RBAC/org scoping, and crash recovery require a transactional store. Redis outages must not lose jobs. MySQL claim transactions give clear correctness stories for evaluators and operators.

## 2. Polling workers + conditional claim (not BullMQ dispatch)

**Choice:** Workers poll MySQL, lock the queue row, and claim with `UPDATE … WHERE status = 'QUEUED'`. Redis Pub/Sub carries **realtime UI events** and **dispatch wake hints**.

**Alternatives:** BullMQ / Redis lists as the dispatch fabric (suggested in the original stack notes).

**Why:** Using BullMQ as the work queue would duplicate state already in MySQL and invite split-brain on retries/DLQ. Conditional claim against MySQL keeps one lifecycle. Redis wake (`djs:dispatch`) only shortens idle latency; poll remains the fallback. Socket.IO fan-out stays on `djs:realtime`. See [rate-limit-dispatch.md](./rate-limit-dispatch.md).

This is an intentional departure from “Redis + BullMQ for dispatch”; see [architecture.md](./architecture.md).

## 3. Candidate batch claim (not `SKIP LOCKED` alone)

**Choice:** Non-locking candidate read → `queues FOR UPDATE` → capacity count → conditional `UPDATE`.

**Alternatives:** `SELECT … FOR UPDATE SKIP LOCKED LIMIT 1` as the entire claim.

**Why:** Under parallel claimers, MySQL’s `ORDER BY … LIMIT 1 SKIP LOCKED` can return **zero** rows while unlocked `QUEUED` siblings remain, starving concurrency. Documented in [concurrency.md](./concurrency.md).

## 4. Separate API and worker processes

**Choice:** NestJS API and NestJS worker are distinct apps in the monorepo.

**Alternatives:** In-process workers inside the API; serverless job runners.

**Why:** Independent scale (`--scale worker=N`), independent crash domains, and clean SIGTERM drain on workers without dropping HTTP. Shared types/Prisma live in packages.

## 5. `jobs.status` as cache; executions as history

**Choice:** Current status on `jobs`; every attempt is an immutable `job_executions` row (+ `job_logs`).

**Alternatives:** Mutate a single job row with attempt counters only.

**Why:** Operators need attempt timelines, stacks, and results. Listing/claiming stay fast on indexed `jobs.status` without rewriting history.

## 6. JWT access + hashed refresh tokens

**Choice:** Short-lived access JWT; refresh JWT stored as SHA-256 in MySQL with rotation.

**Alternatives:** Opaque server sessions only; long-lived JWTs without revocation.

**Why:** Stateless API auth for dashboards/CLIs, with logout and reuse detection that pure JWT cannot provide.

## 7. Controlled `taskType` registry

**Choice:** Handlers are a fixed registry (`send_email`, `test_success`, …). Payloads are JSON; no user-supplied code.

**Alternatives:** Dynamic script execution; plugin sandbox.

**Why:** Security and determinism for a scheduler demo/production-inspired core. Extending work means adding a typed handler, not evaluating strings.

## 8. Cron evaluation in the worker (not OS cron / external scheduler)

**Choice:** `scheduled_jobs` + worker promotion using `cron-parser` and IANA timezones.

**Alternatives:** System crontab; cloud scheduler pushing HTTP.

**Why:** Keeps schedule state next to jobs, supports pause/resume and multi-tenant orgs, and works identically in Docker Compose.

## 9. Socket.IO via Redis channel (not polling-only UI)

**Choice:** Workers/API publish to Redis; API gateway rooms broadcast to browsers.

**Alternatives:** Dashboard polling every few seconds only.

**Why:** Lower latency for ops views; polling remains a fine fallback if the socket drops (React Query still refetches).

## 10. Compose overlays instead of Kubernetes

**Choice:** Docker Compose + scale/prod/observability overlays for Phase 17.

**Alternatives:** Helm/K8s manifests in-repo.

**Why:** Matches the assignment’s Docker/Compose scope and keeps local demo friction low. K8s would add little correctness value for this codebase size.

## Rejected / deferred

| Idea | Status |
|------|--------|
| Workflow DAGs / job dependencies | Bonus; not required for core lifecycle |
| Queue sharding | Deferred; single-queue indexes suffice at demo scale |
| AI failure summaries | Bonus; out of scope |
| Rate limiting / distributed locks / event-driven wake | Implemented — [rate-limit-dispatch.md](./rate-limit-dispatch.md) |
| TLS / secrets manager | Deferred to real production hardening |
| Auto-delete of job/execution rows | Retention only for logs/heartbeats; history kept |

Cross-links: [reliability.md](./reliability.md), [concurrency.md](./concurrency.md), [deployment.md](./deployment.md).
