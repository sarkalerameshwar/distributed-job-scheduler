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
    return <div className="text-sm text-steel">Loading job…</div>;
  }
  if (!job.data) {
    return <div className="text-sm text-signal-danger">Job not found.</div>;
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
            className="border border-signal-warn/40 px-3 py-1.5 text-sm text-signal-warn"
            onClick={() => cancel.mutate()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="bg-pine px-3 py-1.5 text-sm font-medium text-surface"
            onClick={() => retry.mutate()}
          >
            Retry
          </button>
        </div>
      </div>
      {actionError ? <p className="text-sm text-signal-danger">{actionError}</p> : null}

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

      <section className="border border-line p-5">
        <h2 className="text-sm font-medium text-ink">Payload</h2>
        <pre className="mt-3 overflow-x-auto bg-surface p-4 font-mono text-xs text-ink/80">
          {JSON.stringify(job.data.payload, null, 2)}
        </pre>
      </section>

      <section className="border border-line p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink">Execution history</h2>
          <p className="text-xs text-steel">
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
          <p className="mt-3 text-sm text-steel">
            No executions yet. The worker creates an attempt record when it claims the job.
          </p>
        )}

        {selectedExecutionId && executionDetail.data ? (
          <div className="mt-4 space-y-3 border border-line bg-surface/60 p-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-steel">
              Attempt #{executionDetail.data.attemptNumber} detail
            </h3>
            {executionDetail.data.errorCode ? (
              <p className="font-mono text-xs text-signal-danger">
                {executionDetail.data.errorCode}: {executionDetail.data.errorMessage}
              </p>
            ) : null}
            {executionDetail.data.errorStack ? (
              <pre className="max-h-40 overflow-auto rounded bg-paper p-3 font-mono text-[11px] text-signal-danger">
                {executionDetail.data.errorStack}
              </pre>
            ) : null}
            {executionDetail.data.result != null ? (
              <pre className="max-h-48 overflow-auto rounded bg-paper p-3 font-mono text-[11px] text-pine-deep">
                {JSON.stringify(executionDetail.data.result, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-steel">No result payload on this attempt.</p>
            )}
          </div>
        ) : null}
      </section>

      <section className="border border-line p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink">Logs</h2>
          {selectedExecutionId ? (
            <button
              type="button"
              className="text-xs text-pine hover:underline"
              onClick={() => setSelectedExecutionId(null)}
            >
              Show all attempts
            </button>
          ) : (
            <p className="text-xs text-steel">Select an execution to filter</p>
          )}
        </div>
        {logs.data?.items.length ? (
          <div className="mt-3 space-y-2">
            {logs.data.items.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-steel">No logs.</p>
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
      className={`flex w-full items-center justify-between px-3 py-2 text-left font-mono text-xs transition ${
        selected ? "bg-pine-mist ring-1 ring-pine" : "bg-paper hover:bg-line/40"
      }`}
    >
      <span className="text-ink">
        #{exec.attemptNumber} · {exec.status}
        {exec.workerIdentity ? ` · ${exec.workerIdentity}` : ""}
        {exec.errorCode ? ` · ${exec.errorCode}` : ""}
      </span>
      <span className="text-steel">
        {exec.durationMs != null ? `${exec.durationMs}ms` : exec.startedAt ?? exec.createdAt}
      </span>
    </button>
  );
}

function LogRow(props: { log: JobLog }) {
  const levelColor =
    props.log.level === "ERROR"
      ? "text-signal-danger"
      : props.log.level === "WARN"
        ? "text-signal-warn"
        : "text-ink/80";
  return (
    <div className="bg-paper px-3 py-2 font-mono text-xs">
      <span className="text-steel">{props.log.createdAt}</span>{" "}
      <span className={levelColor}>[{props.log.level}]</span> {props.log.message}
    </div>
  );
}

function Meta(props: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-steel">{props.label}</p>
      <p className="mt-2 break-all text-sm text-ink">{props.value}</p>
    </div>
  );
}
