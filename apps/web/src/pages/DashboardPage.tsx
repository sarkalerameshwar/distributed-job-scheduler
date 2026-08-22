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

const healthTone: Record<HealthStatus, string> = {
  ok: "text-emerald-400 border-emerald-800 bg-emerald-950/40",
  degraded: "text-amber-300 border-amber-800 bg-amber-950/40",
  down: "text-rose-400 border-rose-800 bg-rose-950/40",
};

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
    <div className="space-y-8">
      <Header
        title="Operations dashboard"
        subtitle="Queue depth, worker liveness, throughput, and failures. Live updates via Socket.IO; light poll every 30s as backup."
      />

      <HealthStrip health={health.data} loading={health.isLoading} error={health.isError} />

      {health.data?.metrics ? <PlatformMetrics metrics={health.data.metrics} /> : null}

      {!orgId ? (
        <p className="text-sm text-slate-500">
          Join or create an organization to see job and queue metrics.{" "}
          <Link to="/organizations" className="text-cyan-300 hover:underline">
            Organizations
          </Link>
        </p>
      ) : null}

      {overview.isLoading ? <p className="text-sm text-slate-500">Loading overview…</p> : null}
      {overview.isError ? (
        <p className="text-sm text-rose-300">Could not load dashboard overview.</p>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Depth" value={data.depth} hint="queued + scheduled + retrying" />
            <Kpi label="Running" value={data.running} hint="claimed + running" />
            <Kpi label="Completed / hr" value={data.completedLastHour} hint="last 60 minutes" />
            <Kpi label="Open DLQ" value={data.openDlq} hint="unresolved dead letters" tone={data.openDlq ? "warn" : "ok"} />
            <Kpi
              label="Workers online"
              value={data.workers.online}
              hint={`${data.workers.failed} failed · ${data.workers.total} total`}
              tone={data.workers.online ? "ok" : "warn"}
            />
          </div>

          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-slate-200">Throughput (24h)</h2>
              <p className="font-mono text-[11px] text-slate-500">completed jobs / hour (UTC)</p>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData(data)}>
                  <defs>
                    <linearGradient id="throughputFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    interval="preserveStartEnd"
                    minTickGap={32}
                  />
                  <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} width={36} />
                  <Tooltip
                    contentStyle={{
                      background: "#020617",
                      border: "1px solid #1e293b",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    stroke="#22d3ee"
                    fill="url(#throughputFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-200">Queue health</h2>
                <Link to="/queues" className="text-xs text-cyan-300 hover:underline">
                  All queues
                </Link>
              </div>
              {!data.queues.length ? (
                <p className="rounded-xl border border-slate-800 p-4 text-sm text-slate-500">No queues yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.queues.map((queue) => (
                    <Link
                      key={queue.id}
                      to={`/queues/${queue.id}`}
                      className="block rounded-xl border border-slate-800 px-4 py-3 hover:border-cyan-800"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-100">{queue.name}</p>
                          <p className="font-mono text-[11px] text-slate-500">{queue.projectName}</p>
                        </div>
                        <StatusPill status={queue.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] text-slate-400">
                        <span>depth {queue.depth}</span>
                        <span>running {queue.running}</span>
                        <span>thru/hr {queue.throughputLastHour}</span>
                        <span>dlq {queue.dlq}</span>
                        <span>max {queue.maxConcurrency}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-200">Needs attention</h2>
                <div className="flex gap-3 text-xs">
                  <Link to="/dlq" className="text-cyan-300 hover:underline">
                    DLQ
                  </Link>
                  <Link to="/workers" className="text-cyan-300 hover:underline">
                    Workers
                  </Link>
                </div>
              </div>

              {data.openDlqEntries.length ? (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Open dead letters</p>
                  {data.openDlqEntries.map((row) => (
                    <Link
                      key={row.id}
                      to="/dlq"
                      className="block rounded-xl border border-rose-950/80 bg-rose-950/20 px-4 py-3 hover:border-rose-800"
                    >
                      <p className="text-sm text-slate-100">{row.jobName}</p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {row.queueName} · {row.reason} · attempts {row.attempts}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-slate-800 p-4 text-sm text-slate-500">No open DLQ entries.</p>
              )}

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Recent failures / retries</p>
                {!data.recentFailures.length ? (
                  <p className="rounded-xl border border-slate-800 p-4 text-sm text-slate-500">Nothing recent.</p>
                ) : (
                  data.recentFailures.map((job) => (
                    <Link
                      key={job.id}
                      to={`/jobs/${job.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 px-4 py-3 hover:border-amber-900"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-100">{job.name}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {job.queueName} · {job.taskType}
                        </p>
                      </div>
                      <StatusPill status={job.status} />
                    </Link>
                  ))
                )}
              </div>

              <div className="rounded-xl border border-slate-800 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Workers</p>
                <p className="mt-2 font-mono text-sm text-slate-300">
                  {data.workers.online} online · {data.workers.draining} draining · {data.workers.failed}{" "}
                  failed · {data.workers.offline} offline
                </p>
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
    return <p className="text-sm text-slate-500">Checking API health…</p>;
  }
  if (props.error || !props.health) {
    return (
      <div className="rounded-xl border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-300">
        Cannot reach API health. Start MySQL, Redis, and the API.
      </div>
    );
  }
  const checks = props.health.checks;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <HealthCard label="API" status={props.health.status} detail={`v${props.health.version}`} />
      {checks.map((check) => (
        <HealthCard key={check.name} label={check.name} status={check.status} detail={formatCheck(check)} />
      ))}
    </div>
  );
}

function PlatformMetrics(props: { metrics: SystemMetricsSnapshot }) {
  const m = props.metrics;
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-200">Platform metrics</h2>
        <a href="/metrics" className="font-mono text-[11px] text-cyan-300 hover:underline" target="_blank" rel="noreferrer">
          GET /metrics
        </a>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 font-mono text-xs text-slate-400">
        <span>depth {m.queueDepth}</span>
        <span>running {m.jobsRunning}</span>
        <span>dlq {m.openDlq}</span>
        <span>
          workers {m.workersOnline}/{m.workersTotal}
        </span>
        {m.httpRequestsTotal !== undefined ? <span>http {m.httpRequestsTotal}</span> : null}
      </div>
    </section>
  );
}

function HealthCard(props: { label: string; status: HealthStatus; detail: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${healthTone[props.status]}`}>
      <p className="font-mono text-[11px] uppercase tracking-wider opacity-80">{props.label}</p>
      <p className="mt-1 text-sm font-semibold capitalize">{props.status}</p>
      <p className="font-mono text-[11px] opacity-80">{props.detail}</p>
    </div>
  );
}

function Kpi(props: { label: string; value: number; hint: string; tone?: "ok" | "warn" }) {
  const tone =
    props.tone === "warn"
      ? "border-amber-900/60 bg-amber-950/20"
      : props.tone === "ok"
        ? "border-emerald-900/50 bg-emerald-950/20"
        : "border-slate-800 bg-slate-900/40";
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <p className="font-mono text-[11px] uppercase tracking-wide text-slate-500">{props.label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{props.value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{props.hint}</p>
    </div>
  );
}

function JobStatusBreakdown(props: { counts: DashboardOverview["jobCounts"] }) {
  const entries = Object.entries(props.counts).filter(([, n]) => n > 0);
  if (!entries.length) {
    return null;
  }
  return (
    <section className="rounded-xl border border-slate-800 p-5">
      <h2 className="mb-3 text-sm font-medium text-slate-200">Job status mix</h2>
      <div className="flex flex-wrap gap-2">
        {entries.map(([status, count]) => (
          <Link
            key={status}
            to={`/jobs?status=${status}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-1.5 hover:border-cyan-800"
          >
            <StatusPill status={status} />
            <span className="font-mono text-xs text-slate-300">{count}</span>
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
