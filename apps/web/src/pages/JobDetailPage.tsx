import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogApi, type JobExecution, type JobLog } from "../services/catalog";
import { ApiRequestError } from "../services/api";
import { Header, StatusPill } from "../components/Page";

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);

  const job = useQuery({
    queryKey: ["job", id],
    queryFn: () => catalogApi.jobs.get(id!),
    enabled: Boolean(id),
    refetchInterval: 3_000,
  });
  const executions = useQuery({
    queryKey: ["job-executions", id],
    queryFn: () => catalogApi.jobs.executions(id!),
    enabled: Boolean(id),
    refetchInterval: 3_000,
  });
  const logs = useQuery({
    queryKey: ["job-logs", id, selectedExecutionId],
    queryFn: () =>
      catalogApi.jobs.logs(id!, {
        executionId: selectedExecutionId ?? undefined,
        limit: 100,
      }),
    enabled: Boolean(id),
    refetchInterval: 3_000,
  });
  const executionDetail = useQuery({
    queryKey: ["job-execution", id, selectedExecutionId],
    queryFn: () => catalogApi.jobs.execution(id!, selectedExecutionId!),
    enabled: Boolean(id && selectedExecutionId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["job", id] });
    void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    void queryClient.invalidateQueries({ queryKey: ["job-logs", id] });
    void queryClient.invalidateQueries({ queryKey: ["job-executions", id] });
    void queryClient.invalidateQueries({ queryKey: ["job-execution", id] });
  };

  const cancel = useMutation({
    mutationFn: () => catalogApi.jobs.cancel(id!),
    onSuccess: invalidate,
  });
  const retry = useMutation({
    mutationFn: () => catalogApi.jobs.retry(id!),
    onSuccess: invalidate,
  });

  const timeline = useMemo(() => executions.data?.items ?? [], [executions.data]);

  if (job.isLoading) {
    return <div className="text-sm text-slate-400">Loading job…</div>;
  }
  if (!job.data) {
    return <div className="text-sm text-rose-300">Job not found.</div>;
  }

  const actionError =
    cancel.error instanceof ApiRequestError
      ? cancel.error.message
      : retry.error instanceof ApiRequestError
        ? retry.error.message
        : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Header
          title={job.data.name}
          subtitle={`${job.data.taskType} · ${job.data.type} · queue ${job.data.queueName ?? job.data.queueId}`}
        />
        <div className="flex items-center gap-3">
          <StatusPill status={job.data.status} />
          <button
            type="button"
            className="rounded-lg border border-amber-800 px-3 py-1.5 text-sm text-amber-200"
            onClick={() => cancel.mutate()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950"
            onClick={() => retry.mutate()}
          >
            Retry
          </button>
        </div>
      </div>
      {actionError ? <p className="text-sm text-rose-300">{actionError}</p> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Meta label="Priority" value={String(job.data.priority)} />
        <Meta label="Attempts" value={`${job.data.attempts} / ${job.data.maxAttempts}`} />
        <Meta label="Timeout" value={job.data.timeoutMs != null ? `${job.data.timeoutMs} ms` : "—"} />
        <Meta label="Scheduled" value={job.data.scheduledAt ?? "—"} />
        <Meta label="Idempotency" value={job.data.idempotencyKey ?? "—"} />
        <Meta
          label="Cron"
          value={job.data.schedule?.cronExpression ?? job.data.schedule?.scheduleType ?? "—"}
        />
      </div>

      <section className="rounded-xl border border-slate-800 p-5">
        <h2 className="text-sm font-medium text-slate-200">Payload</h2>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 font-mono text-xs text-slate-300">
          {JSON.stringify(job.data.payload, null, 2)}
        </pre>
      </section>

      <section className="rounded-xl border border-slate-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-slate-200">Execution history</h2>
          <p className="text-xs text-slate-500">
            Attempt audit trail (independent of current job status)
          </p>
        </div>
        {timeline.length ? (
          <div className="mt-4 space-y-2">
            {timeline.map((exec) => (
              <ExecutionRow
                key={exec.id}
                exec={exec}
                selected={selectedExecutionId === exec.id}
                onSelect={() =>
                  setSelectedExecutionId((prev) => (prev === exec.id ? null : exec.id))
                }
              />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            No executions yet. The worker creates an attempt record when it claims the job.
          </p>
        )}

        {selectedExecutionId && executionDetail.data ? (
          <div className="mt-4 space-y-3 rounded-lg border border-slate-700 bg-slate-950/60 p-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Attempt #{executionDetail.data.attemptNumber} detail
            </h3>
            {executionDetail.data.errorCode ? (
              <p className="font-mono text-xs text-rose-300">
                {executionDetail.data.errorCode}: {executionDetail.data.errorMessage}
              </p>
            ) : null}
            {executionDetail.data.errorStack ? (
              <pre className="max-h-40 overflow-auto rounded bg-slate-900 p-3 font-mono text-[11px] text-rose-200/80">
                {executionDetail.data.errorStack}
              </pre>
            ) : null}
            {executionDetail.data.result != null ? (
              <pre className="max-h-48 overflow-auto rounded bg-slate-900 p-3 font-mono text-[11px] text-emerald-200/90">
                {JSON.stringify(executionDetail.data.result, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-slate-500">No result payload on this attempt.</p>
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-slate-200">Logs</h2>
          {selectedExecutionId ? (
            <button
              type="button"
              className="text-xs text-cyan-400 hover:underline"
              onClick={() => setSelectedExecutionId(null)}
            >
              Show all attempts
            </button>
          ) : (
            <p className="text-xs text-slate-500">Select an execution to filter</p>
          )}
        </div>
        {logs.data?.items.length ? (
          <div className="mt-3 space-y-2">
            {logs.data.items.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No logs.</p>
        )}
      </section>
    </div>
  );
}

function ExecutionRow(props: {
  exec: JobExecution;
  selected: boolean;
  onSelect: () => void;
}) {
  const { exec, selected, onSelect } = props;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-mono text-xs transition ${
        selected ? "bg-cyan-950/50 ring-1 ring-cyan-700" : "bg-slate-900 hover:bg-slate-800"
      }`}
    >
      <span className="text-slate-200">
        #{exec.attemptNumber} · {exec.status}
        {exec.workerIdentity ? ` · ${exec.workerIdentity}` : ""}
        {exec.errorCode ? ` · ${exec.errorCode}` : ""}
      </span>
      <span className="text-slate-500">
        {exec.durationMs != null ? `${exec.durationMs}ms` : exec.startedAt ?? exec.createdAt}
      </span>
    </button>
  );
}

function LogRow(props: { log: JobLog }) {
  const levelColor =
    props.log.level === "ERROR"
      ? "text-rose-300"
      : props.log.level === "WARN"
        ? "text-amber-300"
        : "text-slate-300";
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs">
      <span className="text-slate-500">{props.log.createdAt}</span>{" "}
      <span className={levelColor}>[{props.log.level}]</span> {props.log.message}
    </div>
  );
}

function Meta(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-slate-500">{props.label}</p>
      <p className="mt-2 break-all text-sm text-white">{props.value}</p>
    </div>
  );
}
