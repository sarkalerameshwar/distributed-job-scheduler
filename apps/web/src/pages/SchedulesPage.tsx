import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { catalogApi, type Schedule } from "../services/catalog";
import { Header, ResourceList, StatusPill } from "../components/Page";
import { ApiRequestError } from "../services/api";
import { useAuth } from "../stores/auth";

export function SchedulesPage() {
  const { memberships } = useAuth();
  const orgId = memberships[0]?.organizationId;
  const queryClient = useQueryClient();
  const [cronExpression, setCronExpression] = useState("*/15 * * * *");
  const [timezone, setTimezone] = useState("UTC");
  const [previewRuns, setPreviewRuns] = useState<string[]>([]);

  const schedules = useQuery({
    queryKey: ["schedules", orgId],
    queryFn: () => catalogApi.schedules.list({ organizationId: orgId! }),
    enabled: Boolean(orgId),
    refetchInterval: 5_000,
  });

  const pause = useMutation({
    mutationFn: (id: string) => catalogApi.schedules.pause(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["schedules"] }),
  });
  const resume = useMutation({
    mutationFn: (id: string) => catalogApi.schedules.resume(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["schedules"] }),
  });
  const preview = useMutation({
    mutationFn: () =>
      catalogApi.schedules.preview({ cronExpression, timezone, count: 5 }),
    onSuccess: (data) => setPreviewRuns(data.nextRuns),
  });

  const items = useMemo(() => schedules.data?.items ?? [], [schedules.data]);
  const actionError =
    pause.error instanceof ApiRequestError
      ? pause.error.message
      : resume.error instanceof ApiRequestError
        ? resume.error.message
        : preview.error instanceof ApiRequestError
          ? preview.error.message
          : null;

  return (
    <div className="space-y-8">
      <Header
        title="Schedules"
        subtitle="Delayed, one-time, and recurring (cron) definitions. Workers promote due rows into QUEUED."
      />

      {!orgId ? (
        <p className="text-sm text-slate-500">Join or create an organization to manage schedules.</p>
      ) : null}

      <section className="rounded-xl border border-slate-800 p-5">
        <h2 className="text-sm font-medium text-slate-200">Cron preview</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <input
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200"
            value={cronExpression}
            onChange={(e) => setCronExpression(e.target.value)}
            placeholder="*/15 * * * *"
          />
          <input
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="UTC"
          />
          <button
            type="button"
            className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950"
            onClick={() => preview.mutate()}
          >
            Preview next 5
          </button>
        </div>
        {previewRuns.length ? (
          <ul className="mt-3 space-y-1 font-mono text-xs text-slate-400">
            {previewRuns.map((run) => (
              <li key={run}>{run}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {actionError ? <p className="text-sm text-rose-300">{actionError}</p> : null}

      <ResourceList
        loading={schedules.isLoading}
        error={schedules.error}
        empty={!items.length}
        emptyText="No schedules yet. Create a DELAYED, SCHEDULED, or RECURRING job."
      >
        <div className="space-y-3">
          {items.map((row) => (
            <ScheduleRow
              key={row.id}
              row={row}
              onPause={() => pause.mutate(row.id)}
              onResume={() => resume.mutate(row.id)}
            />
          ))}
        </div>
      </ResourceList>
    </div>
  );
}

function ScheduleRow(props: {
  row: Schedule;
  onPause: () => void;
  onResume: () => void;
}) {
  const { row, onPause, onResume } = props;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
      <div>
        <div className="flex items-center gap-2">
          <Link to={`/jobs/${row.jobId}`} className="font-medium text-white hover:text-cyan-300">
            {row.job.name}
          </Link>
          <StatusPill status={row.active ? "ACTIVE" : "PAUSED"} />
          <span className="font-mono text-[11px] text-slate-500">{row.scheduleType}</span>
        </div>
        <p className="mt-1 font-mono text-xs text-slate-500">
          {row.cronExpression ? `${row.cronExpression} · ${row.timezone}` : row.timezone} · next{" "}
          {row.nextRunAt}
          {row.lastRunAt ? ` · last ${row.lastRunAt}` : ""}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-slate-600">
          {row.job.projectName} / {row.job.queueName} · job {row.job.status}
        </p>
      </div>
      <div className="flex gap-2">
        {row.active ? (
          <button
            type="button"
            className="rounded-lg border border-amber-800 px-3 py-1.5 text-xs text-amber-200"
            onClick={onPause}
          >
            Pause
          </button>
        ) : (
          <button
            type="button"
            className="rounded-lg border border-emerald-800 px-3 py-1.5 text-xs text-emerald-200"
            onClick={onResume}
          >
            Resume
          </button>
        )}
      </div>
    </div>
  );
}
