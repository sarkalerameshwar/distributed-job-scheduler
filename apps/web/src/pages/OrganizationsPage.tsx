import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogApi, type Organization } from "../services/catalog";
import { ApiRequestError } from "../services/api";
import { Header, ResourceList } from "../components/Page";

export function OrganizationsPage() {
  const queryClient = useQueryClient();
  const orgs = useQuery({ queryKey: ["organizations"], queryFn: catalogApi.organizations.list });
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => catalogApi.organizations.create({ name }),
    onSuccess: () => {
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Create failed"),
  });

  return (
    <div className="space-y-8">
      <Header title="Organizations" subtitle="Tenants that own projects and queues. Creating an org makes you OWNER." />
      <form
        className="flex max-w-xl gap-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        <input
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          placeholder="Organization name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950" type="submit">
          Create
        </button>
      </form>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <ResourceList
        loading={orgs.isLoading}
        error={orgs.error}
        empty={!orgs.data?.items.length}
        emptyText="No organizations yet."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {orgs.data?.items.map((org) => (
            <OrgCard key={org.id} org={org} />
          ))}
        </div>
      </ResourceList>
    </div>
  );
}

function OrgCard({ org }: { org: Organization }) {
  return (
    <Link
      to={`/organizations/${org.id}`}
      className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition hover:border-cyan-800"
    >
      <p className="font-medium text-white">{org.name}</p>
      <p className="mt-1 font-mono text-xs text-slate-500">
        {org.slug} · {org.role}
      </p>
    </Link>
  );
}
