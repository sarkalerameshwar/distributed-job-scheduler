import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { catalogApi } from "../services/catalog";
import { Header, ResourceList, StatusPill } from "../components/Page";

export function QueuesPage() {
  const queues = useQuery({ queryKey: ["queues"], queryFn: () => catalogApi.queues.list() });

  return (
    <div className="space-y-8">
      <Header title="Queues" subtitle="Pause stops new work; running jobs may finish. Archive disables the queue." />
      <ResourceList
        loading={queues.isLoading}
        error={queues.error}
        empty={!queues.data?.items.length}
        emptyText="No queues. Create one from a project."
      >
        <div className="space-y-3">
          {queues.data?.items.map((queue) => (
            <Link
              key={queue.id}
              to={`/queues/${queue.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-4 hover:border-cyan-800"
            >
              <div>
                <p className="font-medium text-white">{queue.name}</p>
                <p className="font-mono text-xs text-slate-500">
                  {queue.projectName} · concurrency {queue.maxConcurrency}
                </p>
              </div>
              <StatusPill status={queue.status} />
            </Link>
          ))}
        </div>
      </ResourceList>
    </div>
  );
}
