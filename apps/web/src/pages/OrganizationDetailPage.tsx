import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { catalogApi, type RetryPolicy, type RetryPreview } from "../services/catalog";
import { Header, ResourceList, StatusPill } from "../components/Page";
import { ApiRequestError } from "../services/api";

export function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<RetryPreview | null>(null);

  const org = useQuery({
    queryKey: ["organizations", id],
    queryFn: () => catalogApi.organizations.get(id!),
    enabled: Boolean(id),
  });
  const projects = useQuery({
    queryKey: ["projects", id],
    queryFn: () => catalogApi.projects.list(id),
    enabled: Boolean(id),
  });
  const policies = useQuery({
    queryKey: ["retry-policies", id],
    queryFn: () => catalogApi.policies.list(id!),
    enabled: Boolean(id),
  });

  const selected = useMemo(
    () => policies.data?.find((p) => p.id === selectedPolicyId) ?? policies.data?.[0] ?? null,
    [policies.data, selectedPolicyId],
  );

  const runPreview = useMutation({
    mutationFn: (policy: RetryPolicy) => catalogApi.policies.preview({ policyId: policy.id }),
    onSuccess: (data) => setPreview(data),
  });

  if (org.isLoading) {
    return <div className="text-sm text-steel">Loading organization…</div>;
  }
  if (!org.data) {
    return <div className="text-sm text-signal-danger">Organization not found.</div>;
  }

  return (
    <div className="space-y-8">
      <Header
        title={org.data.name}
        subtitle={`${org.data.slug} · your role ${org.data.role} · ${org.data.projectCount ?? 0} projects · ${org.data.memberCount ?? 0} members`}
      />

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-ink">Retry policies</h2>
        <p className="text-sm text-steel">
          FIXED / LINEAR / EXPONENTIAL backoff. Job failures schedule{" "}
          <span className="font-mono text-steel">RETRYING</span> with{" "}
          <span className="font-mono text-steel">nextRetryAt</span>.
        </p>
        <ResourceList
          loading={policies.isLoading}
          error={policies.error}
          empty={!policies.data?.length}
          emptyText="No retry policies."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {policies.data?.map((policy) => (
              <button
                key={policy.id}
                type="button"
                onClick={() => {
                  setSelectedPolicyId(policy.id);
                  runPreview.mutate(policy);
                }}
                className={`border p-4 text-left transition ${
                  selected?.id === policy.id
                    ? "border-pine bg-pine-mist"
                    : "border-line bg-surface hover:border-pine/50 hover:shadow-card"
                }`}
              >
                <p className="font-medium text-ink">{policy.name}</p>
                <p className="mt-1 font-mono text-xs text-steel">
                  {policy.strategy} · {policy.maxAttempts} attempts · {policy.initialDelayMs}ms →{" "}
                  {policy.maxDelayMs}ms
                  {policy.strategy === "EXPONENTIAL" ? ` · ×${policy.multiplier}` : ""}
                </p>
              </button>
            ))}
          </div>
        </ResourceList>

        {runPreview.error instanceof ApiRequestError ? (
          <p className="text-sm text-signal-danger">{runPreview.error.message}</p>
        ) : null}

        {preview ? (
          <div className="panel/60 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium text-ink">
                Backoff schedule · {preview.strategy}
              </h3>
              <p className="font-mono text-xs text-steel">
                total wait {preview.totalBackoffMs}ms across {preview.schedule.length} delays
              </p>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left font-mono text-xs text-ink/80">
                <thead className="text-steel">
                  <tr>
                    <th className="py-1 pr-4">After attempt</th>
                    <th className="py-1 pr-4">Next attempt</th>
                    <th className="py-1">Delay</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.schedule.map((row) => (
                    <tr key={row.afterAttempt} className="border-t border-line">
                      <td className="py-1.5 pr-4">#{row.afterAttempt}</td>
                      <td className="py-1.5 pr-4">#{row.nextAttempt}</td>
                      <td className="py-1.5">{row.delayMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : selected ? (
          <button
            type="button"
            className="text-sm text-pine hover:underline"
            onClick={() => runPreview.mutate(selected)}
          >
            Preview backoff for {selected.name}
          </button>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-ink">Projects</h2>
        <ResourceList
          loading={projects.isLoading}
          error={projects.error}
          empty={!projects.data?.items.length}
          emptyText="No projects in this organization."
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
                  {project.slug} · {project.queueCount ?? 0} queues
                </p>
              </Link>
            ))}
          </div>
        </ResourceList>
      </section>
    </div>
  );
}
