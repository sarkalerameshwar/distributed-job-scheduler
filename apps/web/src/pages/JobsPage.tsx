import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TASK_TYPES } from "@djs/shared-types";
import { catalogApi } from "../services/catalog";
import { ApiRequestError } from "../services/api";
import { Header, ResourceList, StatusPill } from "../components/Page";

export function JobsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const queues = useQuery({ queryKey: ["queues"], queryFn: () => catalogApi.queues.list() });
  const [queueId, setQueueId] = useState("");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const selectedQueue = queueId || queues.data?.items[0]?.id || "";

  useEffect(() => {
    const fromUrl = searchParams.get("status") ?? "";
    setStatus(fromUrl);
  }, [searchParams]);

  const jobs = useQuery({
    queryKey: ["jobs", selectedQueue, status],
    queryFn: () =>
      catalogApi.jobs.list({
        queueId: selectedQueue || undefined,
        status: status || undefined,
      }),
    enabled: Boolean(queues.data),
  });

  const [name, setName] = useState("Welcome email");
  const [taskType, setTaskType] = useState<(typeof TASK_TYPES)[number]>("send_email");
  const [jobType, setJobType] = useState("IMMEDIATE");
  const [delayMs, setDelayMs] = useState("60000");
  const [cron, setCron] = useState("0 9 * * *");
  const [error, setError] = useState<string | null>(null);

  const queueOptions = useMemo(() => queues.data?.items ?? [], [queues.data]);

  const create = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        queueId: selectedQueue,
        name,
        type: jobType,
        taskType,
        payload: defaultPayload(taskType),
        priority: 5,
      };
      if (jobType === "DELAYED") {
        body.delayMs = Number(delayMs);
      }
      if (jobType === "SCHEDULED") {
        body.scheduledAt = new Date(Date.now() + 3_600_000).toISOString();
      }
      if (jobType === "RECURRING") {
        body.cronExpression = cron;
      }
      return catalogApi.jobs.create(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (err: unknown) => setError(err instanceof ApiRequestError ? err.message : "Create failed"),
  });

  return (
    <div className="space-y-8">
      <Header
        title="Jobs"
        subtitle="Create immediate, delayed, scheduled, or recurring jobs. The worker claims and executes queued work."
      />

      <div className="flex flex-wrap gap-3">
        <select
          className="field"
          value={selectedQueue}
          onChange={(e) => setQueueId(e.target.value)}
        >
          {queueOptions.map((queue) => (
            <option key={queue.id} value={queue.id}>
              {queue.projectName} / {queue.name}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={status}
          onChange={(e) => {
            const next = e.target.value;
            setStatus(next);
            if (next) {
              setSearchParams({ status: next });
            } else {
              setSearchParams({});
            }
          }}
        >
          <option value="">All statuses</option>
          {["QUEUED", "SCHEDULED", "RUNNING", "COMPLETED", "FAILED", "RETRYING", "DLQ", "CANCELLED"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <form
        className="grid max-w-3xl gap-3 border border-line bg-surface p-5 sm:grid-cols-2"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        <input
          className="panel px-3 py-2 text-sm sm:col-span-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Job name"
          required
        />
        <select
          className="field"
          value={jobType}
          onChange={(e) => setJobType(e.target.value)}
        >
          {["IMMEDIATE", "DELAYED", "SCHEDULED", "RECURRING"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={taskType}
          onChange={(e) => setTaskType(e.target.value as (typeof TASK_TYPES)[number])}
        >
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {jobType === "DELAYED" ? (
          <input
            className="field"
            value={delayMs}
            onChange={(e) => setDelayMs(e.target.value)}
            placeholder="Delay ms"
          />
        ) : null}
        {jobType === "RECURRING" ? (
          <input
            className="field"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="Cron"
          />
        ) : null}
        <button className="btn-primary sm:col-span-2" type="submit">
          Create job
        </button>
      </form>
      {error ? <p className="text-sm text-signal-danger">{error}</p> : null}

      <ResourceList loading={jobs.isLoading} error={jobs.error} empty={!jobs.data?.items.length} emptyText="No jobs.">
        <div className="space-y-3">
          {jobs.data?.items.map((job) => (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className="panel flex items-center justify-between px-5 py-4 hover:border-pine/50 hover:shadow-card"
            >
              <div>
                <p className="font-medium text-ink">{job.name}</p>
                <p className="font-mono text-xs text-steel">
                  {job.taskType} · {job.type} · p{job.priority} · {job.queueName}
                </p>
              </div>
              <StatusPill status={job.status} />
            </Link>
          ))}
        </div>
      </ResourceList>
    </div>
  );
}

function defaultPayload(taskType: string): Record<string, unknown> {
  switch (taskType) {
    case "send_email":
      return { to: "ada@example.com", subject: "Hello", body: "Welcome" };
    case "generate_report":
      return { report: "weekly_usage", format: "csv" };
    case "send_notification":
      return { userId: "user_1", channel: "in_app", template: "welcome" };
    case "cleanup":
      return { path: "/tmp/djs", olderThanHours: 24 };
    case "data_export":
      return { customerId: "cust_1", format: "json" };
    default:
      return { marker: "ui" };
  }
}
