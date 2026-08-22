import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { catalogApi, type DeadLetterEntry } from "../services/catalog";
import { Header, ResourceList, StatusPill } from "../components/Page";
import { ApiRequestError } from "../services/api";
import { useAuth } from "../stores/auth";

export function DlqPage() {
  const { memberships } = useAuth();
  const orgId = memberships[0]?.organizationId;
  const queryClient = useQueryClient();
  const [resolvedFilter, setResolvedFilter] = useState<"open" | "resolved" | "all">("open");

  const resolved =
    resolvedFilter === "open" ? false : resolvedFilter === "resolved" ? true : undefined;

  const dlq = useQuery({
    queryKey: ["dlq", orgId, resolvedFilter],
    queryFn: () =>
      catalogApi.dlq.list({
        organizationId: orgId!,
        resolved,
      }),
    enabled: Boolean(orgId),
    refetchInterval: 5_000,
  });

  const retry = useMutation({
    mutationFn: (id: string) => catalogApi.dlq.retry(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["dlq"] }),
  });
  const discard = useMutation({
    mutationFn: (id: string) => catalogApi.dlq.discard(id, "Discarded from dashboard"),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["dlq"] }),
  });
  const resolve = useMutation({
    mutationFn: (id: string) => catalogApi.dlq.resolve(id, "Acknowledged from dashboard"),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["dlq"] }),
  });

  const items = useMemo(() => dlq.data?.items ?? [], [dlq.data]);
  const actionError =
    retry.error instanceof ApiRequestError
      ? retry.error.message
      : discard.error instanceof ApiRequestError
        ? discard.error.message
        : resolve.error instanceof ApiRequestError
          ? resolve.error.message
          : null;

  return (
    <div className="space-y-8">
      <Header
        title="Dead letter queue"
        subtitle="Jobs that exhausted retries. Retry to re-queue, or discard/resolve without running again."
      />

      {!orgId ? (
        <p className="text-sm text-slate-500">Join or create an organization to inspect the DLQ.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["open", "Open"],
              ["resolved", "Resolved"],
              ["all", "All"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm ${
                resolvedFilter === value
                  ? "bg-cyan-500 text-slate-950"
                  : "border border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
              onClick={() => setResolvedFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {actionError ? <p className="text-sm text-rose-300">{actionError}</p> : null}

      <ResourceList
        loading={dlq.isLoading}
        error={dlq.error}
        empty={!items.length}
        emptyText="No dead-letter entries for this filter."
      >
        <div className="space-y-3">
          {items.map((row) => (
            <DlqRow
              key={row.id}
              row={row}
              busy={retry.isPending || discard.isPending || resolve.isPending}
              onRetry={() => retry.mutate(row.id)}
              onDiscard={() => discard.mutate(row.id)}
              onResolve={() => resolve.mutate(row.id)}
            />
          ))}
        </div>
      </ResourceList>
    </div>
  );
}

function DlqRow(props: {
  row: DeadLetterEntry;
  busy: boolean;
  onRetry: () => void;
  onDiscard: () => void;
  onResolve: () => void;
}) {
  const { row, busy, onRetry, onDiscard, onResolve } = props;
  const open = !row.resolvedAt;

  return (
    <div className="rounded-xl border border-slate-800 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/jobs/${row.jobId}`} className="font-medium text-cyan-300 hover:underline">
              {row.job.name}
            </Link>
            <StatusPill status={row.job.status} />
            {row.resolution ? <StatusPill status={row.resolution} /> : null}
          </div>
          <p className="font-mono text-xs text-slate-500">
            {row.job.projectName} / {row.job.queueName} · {row.job.taskType} · attempts {row.attempts}
          </p>
          <p className="text-sm text-slate-300">{row.reason}</p>
          {row.finalError ? (
            <p className="truncate font-mono text-xs text-rose-300/90">{row.finalError}</p>
          ) : null}
          <p className="font-mono text-[11px] text-slate-600">
            moved {new Date(row.movedAt).toLocaleString()}
            {row.resolvedAt ? ` · resolved ${new Date(row.resolvedAt).toLocaleString()}` : ""}
          </p>
        </div>
        {open ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 disabled:opacity-50"
              onClick={onRetry}
            >
              Retry
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50"
              onClick={onResolve}
            >
              Resolve
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-rose-800/60 px-3 py-1.5 text-sm text-rose-300 disabled:opacity-50"
              onClick={onDiscard}
            >
              Discard
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
