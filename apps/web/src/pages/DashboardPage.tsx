import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { catalogApi, type DashboardOverview } from "../services/catalog";
import { useApiHealth } from "../hooks/useApiHealth";
import { Header, StatusPill } from "../components/Page";
import { useAuth } from "../stores/auth";
import type { DependencyCheck, HealthStatus, SystemMetricsSnapshot } from "@djs/shared-types";

export function DashboardPage() {
  const { memberships } = useAuth();
  const orgId = memberships[0]?.organizationId;
  const health = useApiHealth();

  const overview = useQuery({
    queryKey: ["dashboard", orgId],
    queryFn: () => catalogApi.dashboard.overview(orgId!),
    enabled: Boolean(orgId),
    refetchInterval: 30_000,
  });

  const data = overview.data;

  return (
    <div className="space-y-6">
      <Header
        title="Operations"
        subtitle="Live queue depth, workers, throughput, and failures."
      />

      <HealthStrip health={health.data} loading={health.isLoading} error={health.isError} />

      {!orgId ? (
        <div className="panel px-5 py-6 text-sm text-steel">
          Create or join an organization to see job metrics.{" "}
          <Link to="/organizations" className="link">
            Organizations
          </Link>
        </div>
      ) : null}

      {overview.isLoading ? <p className="text-sm text-steel">Loading overview…</p> : null}
      {overview.isError ? (
        <p className="text-sm text-signal-danger">Could not load dashboard overview.</p>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Depth" value={data.depth} hint="Queued + scheduled + retrying" />
            <Kpi label="Running" value={data.running} hint="Claimed + running" />
            <Kpi label="Completed / hr" value={data.completedLastHour} hint="Last 60 minutes" />
            <Kpi
              label="Open DLQ"
              value={data.openDlq}
              hint="Unresolved dead letters"
              tone={data.openDlq > 0 ? "warn" : undefined}
            />
            <Kpi
              label="Workers online"
              value={data.workers.online}
              hint={`${data.workers.failed} failed · ${data.workers.total} total`}
              tone={data.workers.online === 0 ? "warn" : undefined}
            />
          </div>

          {health.data?.metrics ? <PlatformMetrics metrics={health.data.metrics} /> : null}

          <section className="panel p-5">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Throughput</h2>
                <p className="text-xs text-steel">Completed jobs per hour · last 24h (UTC)</p>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData(data)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="throughputFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--color-pine))" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="rgb(var(--color-pine))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                    axisLine={{ stroke: "var(--chart-grid)" }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={36}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--chart-tooltip-bg)",
                      border: "1px solid var(--chart-tooltip-border)",
                      borderRadius: 10,
                      fontSize: 12,
                      color: "rgb(var(--color-ink))",
                      boxShadow: "var(--shadow-lift)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    stroke="rgb(var(--color-pine))"
                    fill="url(#throughputFill)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "rgb(var(--color-pine))" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink">Queue health</h2>
                <Link to="/queues" className="text-xs font-semibold text-pine hover:underline">
                  View all
                </Link>
              </div>
              {!data.queues.length ? (
                <p className="px-5 py-8 text-sm text-steel">No queues yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.queues.map((queue) => (
                    <li key={queue.id}>
                      <Link
                        to={`/queues/${queue.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-canvas/80"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-ink">{queue.name}</p>
                            <StatusPill status={queue.status} />
                          </div>
                          <p className="mt-0.5 text-xs text-steel">{queue.projectName}</p>
                        </div>
                        <div className="hidden shrink-0 gap-4 text-right font-mono text-[11px] text-steel sm:flex">
                          <span>depth {queue.depth}</span>
                          <span>run {queue.running}</span>
                          <span>dlq {queue.dlq}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <h2 className="text-sm font-semibold text-ink">Needs attention</h2>
                <div className="flex gap-3 text-xs font-semibold">
                  <Link to="/dlq" className="text-pine hover:underline">
                    DLQ
                  </Link>
                  <Link to="/workers" className="text-pine hover:underline">
                    Workers
                  </Link>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div>
                  <p className="section-label mb-2">Open dead letters</p>
                  {!data.openDlqEntries.length ? (
                    <p className="rounded-lg border border-dashed border-line px-3 py-4 text-sm text-steel">
                      None open.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {data.openDlqEntries.map((row) => (
                        <li key={row.id}>
                          <Link
                            to="/dlq"
                            className="block rounded-lg border border-signal-danger/15 bg-signal-danger/[0.03] px-3 py-2.5 transition hover:border-signal-danger/30"
                          >
                            <p className="text-sm font-medium text-ink">{row.jobName}</p>
                            <p className="mt-0.5 font-mono text-[11px] text-steel">
                              {row.queueName} · {row.reason} · attempts {row.attempts}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="section-label mb-2">Recent failures</p>
                  {!data.recentFailures.length ? (
                    <p className="rounded-lg border border-dashed border-line px-3 py-4 text-sm text-steel">
                      Nothing recent.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {data.recentFailures.map((job) => (
                        <li key={job.id}>
                          <Link
                            to={`/jobs/${job.id}`}
                            className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 transition hover:bg-canvas"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-ink">{job.name}</p>
                              <p className="font-mono text-[11px] text-steel">
                                {job.queueName} · {job.taskType}
                              </p>
                            </div>
                            <StatusPill status={job.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-lg bg-canvas px-3 py-3">
                  <p className="section-label">Workers</p>
                  <p className="mt-1.5 text-sm font-medium text-ink">
                    {data.workers.online} online
                    <span className="font-normal text-steel">
                      {" "}
                      · {data.workers.draining} draining · {data.workers.failed} failed ·{" "}
                      {data.workers.offline} offline
                    </span>
                  </p>
                </div>
              </div>
            </section>
          </div>

          <JobStatusBreakdown counts={data.jobCounts} />
        </>
      ) : null}
    </div>
  );
}

function HealthStrip(props: {
  health: ReturnType<typeof useApiHealth>["data"];
  loading: boolean;
  error: boolean;
}) {
  if (props.loading) {
    return <p className="text-sm text-steel">Checking API health…</p>;
  }
  if (props.error || !props.health) {
    return (
      <div className="rounded-xl border border-signal-danger/20 bg-signal-danger/5 px-4 py-3 text-sm text-signal-danger">
        Cannot reach API health. Start MySQL, Redis, and the API.
      </div>
    );
  }

  const items: Array<{ label: string; status: HealthStatus; detail: string }> = [
    { label: "API", status: props.health.status, detail: `v${props.health.version}` },
    ...props.health.checks.map((check) => ({
      label: check.name,
      status: check.status,
      detail: formatCheck(check),
    })),
  ];

  return (
    <div className="panel flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
      <span className="section-label">System</span>
      <div className="flex flex-wrap items-center gap-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                item.status === "ok"
                  ? "bg-signal-ok"
                  : item.status === "degraded"
                    ? "bg-signal-warn"
                    : "bg-signal-danger"
              }`}
            />
            <span className="text-sm font-semibold capitalize text-ink">{item.label}</span>
            <span className="text-xs text-steel">{item.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlatformMetrics(props: { metrics: SystemMetricsSnapshot }) {
  const m = props.metrics;
  const cells = [
    { label: "Queue depth", value: m.queueDepth },
    { label: "Running", value: m.jobsRunning },
    { label: "Open DLQ", value: m.openDlq },
    { label: "Workers", value: `${m.workersOnline}/${m.workersTotal}` },
    ...(m.httpRequestsTotal !== undefined
      ? [{ label: "HTTP requests", value: m.httpRequestsTotal }]
      : []),
  ];

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">Platform metrics</h2>
        <a
          href="/metrics"
          className="text-xs font-semibold text-pine hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Prometheus /metrics
        </a>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            className={`px-5 py-4 ${i > 0 ? "border-l border-line" : ""} ${i >= 2 ? "max-sm:border-t" : ""}`}
          >
            <p className="text-xs font-medium text-steel">{cell.label}</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-ink">{cell.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Kpi(props: { label: string; value: number; hint: string; tone?: "warn" }) {
  return (
    <div
      className={`panel relative overflow-hidden px-4 py-4 ${
        props.tone === "warn" ? "ring-1 ring-inset ring-signal-warn/25" : ""
      }`}
    >
      {props.tone === "warn" ? (
        <span className="absolute inset-y-0 left-0 w-1 bg-signal-warn" />
      ) : null}
      <p className="text-xs font-semibold text-steel">{props.label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-ink">{props.value}</p>
      <p className="mt-1 text-xs text-steel">{props.hint}</p>
    </div>
  );
}

function JobStatusBreakdown(props: { counts: DashboardOverview["jobCounts"] }) {
  const entries = Object.entries(props.counts).filter(([, n]) => n > 0);
  if (!entries.length) {
    return null;
  }
  return (
    <section className="panel p-5">
      <h2 className="mb-3 text-sm font-semibold text-ink">Job status mix</h2>
      <div className="flex flex-wrap gap-2">
        {entries.map(([status, count]) => (
          <Link
            key={status}
            to={`/jobs?status=${status}`}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-canvas/50 px-3 py-1.5 transition hover:border-pine/40 hover:bg-pine-mist"
          >
            <StatusPill status={status} />
            <span className="font-mono text-xs font-semibold tabular-nums text-ink">{count}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function chartData(data: DashboardOverview) {
  return data.throughputSeries.map((point) => ({
    ...point,
    label: new Date(point.hour).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
    }),
  }));
}

function formatCheck(check: DependencyCheck): string {
  const latency = check.latencyMs !== undefined ? `${check.latencyMs}ms` : "n/a";
  return check.error ? `${latency} · ${check.error}` : latency;
}
