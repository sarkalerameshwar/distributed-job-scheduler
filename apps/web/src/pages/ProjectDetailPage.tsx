import { FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogApi } from "../services/catalog";
import { ApiRequestError } from "../services/api";
import { Header, ResourceList, StatusPill } from "../components/Page";

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const project = useQuery({
    queryKey: ["project", id],
    queryFn: () => catalogApi.projects.get(id!),
    enabled: Boolean(id),
  });
  const queues = useQuery({
    queryKey: ["queues", "project", id],
    queryFn: () => catalogApi.queues.list({ projectId: id }),
    enabled: Boolean(id),
  });
  const policies = useQuery({
    queryKey: ["policies", project.data?.organizationId],
    queryFn: () => catalogApi.policies.list(project.data!.organizationId),
    enabled: Boolean(project.data?.organizationId),
  });
  const [name, setName] = useState("email");
  const [retryPolicyId, setRetryPolicyId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      catalogApi.queues.create({
        projectId: id,
        name,
        retryPolicyId: retryPolicyId || policies.data?.[0]?.id,
        maxConcurrency: 5,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["queues"] });
    },
    onError: (err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Create failed"),
  });

  if (!project.data && !project.isLoading) {
    return <div className="text-sm text-signal-danger">Project not found.</div>;
  }

  return (
    <div className="space-y-8">
      <Header
        title={project.data?.name ?? "Project"}
        subtitle={`${project.data?.slug ?? ""} · ${project.data?.queueCount ?? 0} queues`}
      />
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Queue name"
          required
        />
        <select
          className="field"
          value={retryPolicyId || policies.data?.[0]?.id || ""}
          onChange={(e) => setRetryPolicyId(e.target.value)}
        >
          {policies.data?.map((policy) => (
            <option key={policy.id} value={policy.id}>
              {policy.name} ({policy.strategy})
            </option>
          ))}
        </select>
        <button className="btn-primary" type="submit">
          Add queue
        </button>
      </form>
      {error ? <p className="text-sm text-signal-danger">{error}</p> : null}
      <ResourceList
        loading={queues.isLoading}
        error={queues.error}
        empty={!queues.data?.items.length}
        emptyText="No queues yet."
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
                  concurrency {queue.maxConcurrency} · {queue.retryPolicy?.name}
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
