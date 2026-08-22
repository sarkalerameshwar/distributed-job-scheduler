import { useQuery } from "@tanstack/react-query";
import { catalogApi, type WorkerRow } from "../services/catalog";
import { Header, ResourceList, StatusPill } from "../components/Page";

export function WorkersPage() {
  const workers = useQuery({
    queryKey: ["workers"],
    queryFn: () => catalogApi.workers.list(),
    refetchInterval: 3_000,
  });

  const items = workers.data?.items ?? [];

  return (
    <div className="space-y-8">
      <Header
        title="Workers"
        subtitle="Process registry and heartbeat liveness. Stale workers are marked FAILED and their in-flight jobs are recovered."
      />

      <ResourceList
        loading={workers.isLoading}
        error={workers.error}
        empty={!items.length}
        emptyText="No workers registered yet. Start the worker process."
      >
        <div className="space-y-3">
          {items.map((row) => (
            <WorkerRowCard key={row.id} row={row} />
          ))}
        </div>
      </ResourceList>
    </div>
  );
}

function WorkerRowCard(props: { row: WorkerRow }) {
  const { row } = props;
  return (
    <div className="rounded-xl border border-slate-800 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-cyan-300">{row.workerId}</span>
            <StatusPill status={row.status} />
          </div>
          <p className="font-mono text-xs text-slate-500">
            {row.hostname} · pid {row.processId} · v{row.version} · concurrency {row.concurrency}
          </p>
          <p className="text-sm text-slate-300">
            in-flight {row.currentJobCount}
            {row.lastHeartbeatAt
              ? ` · last beat ${new Date(row.lastHeartbeatAt).toLocaleString()}`
              : " · no heartbeat yet"}
          </p>
        </div>
      </div>
    </div>
  );
}
