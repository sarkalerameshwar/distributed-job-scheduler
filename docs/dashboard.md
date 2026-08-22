# Operations dashboard

Phase 13 turns the home page into an **operations overview** for the signed-in user’s organization.

## What it shows

| Area | Source |
|------|--------|
| API / MySQL / Redis health | `GET /health` (polled) |
| Depth, running, completed/hr, open DLQ, workers online | `GET /dashboard/overview` |
| 24h throughput chart | Hourly completed-job buckets (UTC) |
| Queue health cards | Per-queue depth / running / throughput / DLQ |
| Open DLQ + recent failures | Linked to `/dlq` and `/jobs/:id` |
| Job status mix | Links to `/jobs?status=` |

Live updates use **Socket.IO** ([realtime.md](./realtime.md)). A 30s poll remains as a safety net.

## API

| Method | Path | Min role | Notes |
|--------|------|----------|--------|
| GET | `/dashboard/overview?organizationId=` | VIEWER | Aggregated KPIs for one org |

Workers are platform-wide (not org-scoped); counts still appear on the overview for operator context.

## UI

- `/` — dashboard (replaces the Phase 1 status-only page)
- Nav uses active-route highlighting; horizontal scroll on small screens
