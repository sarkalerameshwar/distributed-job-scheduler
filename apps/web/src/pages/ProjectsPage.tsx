import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogApi } from "../services/catalog";
import { ApiRequestError } from "../services/api";
import { Header, ResourceList, StatusPill } from "../components/Page";

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const orgs = useQuery({ queryKey: ["organizations"], queryFn: catalogApi.organizations.list });
  const [organizationId, setOrganizationId] = useState("");
  const selectedOrg = organizationId || orgs.data?.items[0]?.id || "";
  const projects = useQuery({
    queryKey: ["projects", selectedOrg],
    queryFn: () => catalogApi.projects.list(selectedOrg || undefined),
    enabled: Boolean(orgs.data),
  });
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const orgOptions = useMemo(() => orgs.data?.items ?? [], [orgs.data]);
  const create = useMutation({
    mutationFn: () => catalogApi.projects.create({ organizationId: selectedOrg, name }),
    onSuccess: () => {
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Create failed"),
  });

  return (
    <div className="space-y-8">
      <Header title="Projects" subtitle="Projects isolate queues. ADMIN or OWNER can create them." />
      <div className="flex flex-wrap gap-3">
        <select
          className="field"
          value={selectedOrg}
          onChange={(e) => setOrganizationId(e.target.value)}
        >
          {orgOptions.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <form
          className="flex gap-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setError(null);
            create.mutate();
          }}
        >
          <input
            className="field"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button className="btn-primary" type="submit">
            Create
          </button>
        </form>
      </div>
      {error ? <p className="text-sm text-signal-danger">{error}</p> : null}
      <ResourceList
        loading={projects.isLoading}
        error={projects.error}
        empty={!projects.data?.items.length}
        emptyText="No projects."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.data?.items.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="panel p-5 hover:border-pine/50 hover:shadow-card"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink">{project.name}</p>
                <StatusPill status={project.status} />
              </div>
              <p className="mt-1 font-mono text-xs text-steel">
                {project.organizationName} · {project.queueCount ?? 0} queues
              </p>
            </Link>
          ))}
        </div>
      </ResourceList>
    </div>
  );
}
