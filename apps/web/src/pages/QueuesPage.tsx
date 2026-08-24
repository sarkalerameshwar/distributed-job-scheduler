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
              className="panel flex items-center justify-between px-5 py-4 hover:border-pine/50 hover:shadow-card"
            >
              <div>
                <p className="font-medium text-ink">{queue.name}</p>
                <p className="font-mono text-xs text-steel">
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
