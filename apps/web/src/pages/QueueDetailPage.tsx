import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogApi } from "../services/catalog";
import { ApiRequestError } from "../services/api";
import { Header, StatusPill } from "../components/Page";

export function QueueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const queue = useQuery({
    queryKey: ["queue", id],
    queryFn: () => catalogApi.queues.get(id!),
    enabled: Boolean(id),
  });
  const stats = useQuery({
    queryKey: ["queue-stats", id],
    queryFn: () => catalogApi.queues.stats(id!),
    enabled: Boolean(id),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["queue", id] });
    void queryClient.invalidateQueries({ queryKey: ["queues"] });
    void queryClient.invalidateQueries({ queryKey: ["queue-stats", id] });
  };

  const pause = useMutation({
    mutationFn: () => catalogApi.queues.pause(id!),
    onSuccess: invalidate,
  });
  const resume = useMutation({
    mutationFn: () => catalogApi.queues.resume(id!),
    onSuccess: invalidate,
  });

  if (queue.isLoading) {
    return <div className="text-sm text-slate-400">Loading queue…</div>;
  }
  if (!queue.data) {
    return <div className="text-sm text-rose-300">Queue not found.</div>;
  }

  const actionError =
    pause.error instanceof ApiRequestError
      ? pause.error.message
      : resume.error instanceof ApiRequestError
        ? resume.error.message
        : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Header
          title={queue.data.name}
          subtitle={`${queue.data.projectName ?? ""} · default priority ${queue.data.defaultPriority} · retry ${queue.data.retryPolicy?.name ?? ""}`}
        />
        <div className="flex items-center gap-3">
          <StatusPill status={queue.data.status} />
          {queue.data.status === "PAUSED" ? (
            <button
              className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950"
              type="button"
              onClick={() => resume.mutate()}
            >
              Resume
            </button>
          ) : (
            <button
              className="rounded-lg border border-amber-800 px-3 py-1.5 text-sm text-amber-200"
              type="button"
              onClick={() => pause.mutate()}
            >
              Pause
            </button>
          )}
        </div>
      </div>
      {actionError ? <p className="text-sm text-rose-300">{actionError}</p> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Depth" value={stats.data?.depth ?? "—"} />
        <Stat label="Running" value={stats.data?.running ?? "—"} />
        <Stat label="Completed / hour" value={stats.data?.throughputLastHour ?? "—"} />
        <Stat
          label="Avg duration"
          value={stats.data?.averageExecutionDurationMs != null ? `${stats.data.averageExecutionDurationMs} ms` : "—"}
        />
        <Stat label="Concurrency" value={queue.data.maxConcurrency} />
        <Stat label="DLQ" value={stats.data?.counts.DLQ ?? "—"} />
      </div>
      {stats.data ? (
        <div className="rounded-xl border border-slate-800 p-5">
          <p className="text-sm font-medium text-slate-200">Job status counts</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-slate-400 sm:grid-cols-3">
            {Object.entries(stats.data.counts).map(([status, count]) => (
              <div key={status} className="flex justify-between rounded-lg bg-slate-900 px-3 py-2">
                <dt>{status}</dt>
                <dd className="text-slate-200">{count}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function Stat(props: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-slate-500">{props.label}</p>
      <p className="mt-2 text-lg text-white">{props.value}</p>
    </div>
  );
}
