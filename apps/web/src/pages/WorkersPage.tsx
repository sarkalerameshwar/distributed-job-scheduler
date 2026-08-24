import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
        subtitle="Process registry, heartbeat liveness, and which jobs each worker currently holds."
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
  const active = row.activeJobs ?? [];
  return (
    <div className="panel px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-pine">{row.workerId}</span>
            <StatusPill status={row.status} />
          </div>
          <p className="font-mono text-xs text-steel">
            {row.hostname} · pid {row.processId} · v{row.version} · concurrency {row.concurrency}
          </p>
          <p className="text-sm text-ink/80">
            in-flight {row.currentJobCount}
            {row.lastHeartbeatAt
              ? ` · last beat ${new Date(row.lastHeartbeatAt).toLocaleString()}`
              : " · no heartbeat yet"}
          </p>
        </div>
      </div>

      {active.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {active.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <Link to={`/jobs/${job.id}`} className="font-medium text-ink hover:text-pine">
                {job.name}
              </Link>
              <span className="font-mono text-[11px] text-steel">
                {job.status} · {job.taskType} · {job.queueName}
              </span>
            </li>
          ))}
        </ul>
      ) : row.status === "ONLINE" || row.status === "DRAINING" ? (
        <p className="mt-3 border-t border-line pt-3 text-xs text-steel">No jobs claimed right now.</p>
      ) : null}
    </div>
  );
}
