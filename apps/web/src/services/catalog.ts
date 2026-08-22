import { apiFetch } from "./api";

export type Page<T> = { items: T[]; page: number; limit: number; total: number; totalPages: number };

export type Organization = {
  id: string;
  name: string;
  slug: string;
  role: string;
  createdAt: string;
  projectCount?: number;
  memberCount?: number;
};

export type Project = {
  id: string;
  organizationId: string;
  organizationName?: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  queueCount?: number;
  jobCount?: number;
};

export type RetryPolicy = {
  id: string;
  organizationId?: string;
  name: string;
  strategy: string;
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
};

export type Schedule = {
  id: string;
  jobId: string;
  scheduleType: string;
  cronExpression: string | null;
  timezone: string;
  nextRunAt: string;
  lastRunAt: string | null;
  active: boolean;
  job: {
    id: string;
    name: string;
    type: string;
    status: string;
    taskType: string;
    queueId: string;
    queueName: string;
    projectId: string;
    projectName: string;
    organizationId: string;
  };
};

export type DeadLetterEntry = {
  id: string;
  jobId: string;
  finalExecutionId: string | null;
  reason: string;
  finalError: string | null;
  attempts: number;
  movedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  job: {
    id: string;
    name: string;
    type: string;
    status: string;
    taskType: string;
    queueId: string;
    queueName: string;
    projectId: string;
    projectName: string;
    organizationId: string;
  };
  finalExecution: {
    id: string;
    status: string;
    errorCode: string | null;
    errorMessage: string | null;
    durationMs: number | null;
    completedAt: string | null;
    attemptNumber: number;
  } | null;
};

export type WorkerRow = {
  id: string;
  workerId: string;
  hostname: string;
  processId: number;
  version: string;
  status: string;
  concurrency: number;
  currentJobCount: number;
  lastHeartbeatAt: string | null;
  startedAt: string;
  stoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DashboardOverview = {
  organizationId: string;
  jobCounts: Record<string, number>;
  depth: number;
  running: number;
  completedLastHour: number;
  failedLastHour: number;
  openDlq: number;
  workers: {
    total: number;
    online: number;
    draining: number;
    failed: number;
    offline: number;
    starting: number;
  };
  queues: Array<{
    id: string;
    name: string;
    projectName: string;
    status: string;
    maxConcurrency: number;
    depth: number;
    running: number;
    dlq: number;
    throughputLastHour: number;
  }>;
  throughputSeries: Array<{ hour: string; completed: number }>;
  recentFailures: Array<{
    id: string;
    name: string;
    status: string;
    taskType: string;
    queueName: string;
    failedAt: string;
  }>;
  openDlqEntries: Array<{
    id: string;
    jobId: string;
    jobName: string;
    queueName: string;
    reason: string;
    attempts: number;
    movedAt: string;
  }>;
};

export type RetryPreview = {
  policyId: string | null;
  strategy: string;
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitterRatio: number;
  schedule: Array<{ afterAttempt: number; nextAttempt: number; delayMs: number }>;
  delayForAttempt: number | null;
  totalBackoffMs: number;
};

export type Queue = {
  id: string;
  projectId: string;
  organizationId?: string;
  projectName?: string;
  name: string;
  description: string | null;
  status: string;
  maxConcurrency: number;
  defaultPriority: number;
  retryPolicyId: string;
  retryPolicy?: { name: string; strategy: string; maxAttempts: number };
  pausedAt: string | null;
  jobCount?: number;
};

export type QueueStats = {
  queueId: string;
  counts: Record<string, number>;
  depth: number;
  running: number;
  throughputLastHour: number;
  averageExecutionDurationMs: number | null;
};

export type Job = {
  id: string;
  projectId: string;
  queueId: string;
  batchId: string | null;
  name: string;
  type: string;
  taskType: string;
  payload: Record<string, unknown>;
  status: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string | null;
  scheduledAt: string | null;
  timeoutMs: number | null;
  createdAt: string;
  queueName?: string;
  projectName?: string;
  organizationId?: string;
  schedule?: {
    scheduleType: string;
    cronExpression: string | null;
    timezone: string;
    nextRunAt: string;
    active: boolean;
  } | null;
};

export type JobExecution = {
  id: string;
  attemptNumber: number;
  status: string;
  workerIdentity: string | null;
  hostname: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  hasResult: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type JobExecutionDetail = JobExecution & {
  errorStack: string | null;
  result: unknown;
  workerVersion: string | null;
  logs: Array<{
    id: string;
    level: string;
    message: string;
    metadata: unknown;
    createdAt: string;
  }>;
};

export type JobLog = {
  id: string;
  level: string;
  message: string;
  executionId: string | null;
  createdAt: string;
};

const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

export const catalogApi = {
  dashboard: {
    overview: (organizationId: string) =>
      apiFetch<DashboardOverview>(`/api/v1/dashboard/overview${qs({ organizationId })}`),
  },
  organizations: {
    list: () => apiFetch<Page<Organization>>("/api/v1/organizations?limit=50"),
    get: (id: string) => apiFetch<Organization>(`/api/v1/organizations/${id}`),
    create: (body: { name: string; slug?: string }) =>
      apiFetch<Organization>("/api/v1/organizations", { method: "POST", body: JSON.stringify(body) }),
  },
  projects: {
    list: (organizationId?: string) =>
      apiFetch<Page<Project>>(`/api/v1/projects${qs({ organizationId, limit: 50 })}`),
    get: (id: string) => apiFetch<Project>(`/api/v1/projects/${id}`),
    create: (body: { organizationId: string; name: string; slug?: string; description?: string }) =>
      apiFetch<Project>("/api/v1/projects", { method: "POST", body: JSON.stringify(body) }),
  },
  queues: {
    list: (filters: { projectId?: string; organizationId?: string } = {}) =>
      apiFetch<Page<Queue>>(`/api/v1/queues${qs({ ...filters, limit: 50 })}`),
    get: (id: string) => apiFetch<Queue>(`/api/v1/queues/${id}`),
    stats: (id: string) => apiFetch<QueueStats>(`/api/v1/queues/${id}/stats`),
    create: (body: Record<string, unknown>) =>
      apiFetch<Queue>("/api/v1/queues", { method: "POST", body: JSON.stringify(body) }),
    pause: (id: string) => apiFetch<Queue>(`/api/v1/queues/${id}/pause`, { method: "POST" }),
    resume: (id: string) => apiFetch<Queue>(`/api/v1/queues/${id}/resume`, { method: "POST" }),
  },
  policies: {
    list: (organizationId: string) => apiFetch<RetryPolicy[]>(`/api/v1/retry-policies${qs({ organizationId })}`),
    get: (id: string) => apiFetch<RetryPolicy>(`/api/v1/retry-policies/${id}`),
    preview: (body: Record<string, unknown>) =>
      apiFetch<RetryPreview>("/api/v1/retry-policies/preview", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    create: (body: Record<string, unknown>) =>
      apiFetch<RetryPolicy>("/api/v1/retry-policies", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      apiFetch<RetryPolicy>(`/api/v1/retry-policies/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  schedules: {
    list: (filters: { organizationId: string; active?: boolean; scheduleType?: string } = { organizationId: "" }) =>
      apiFetch<Page<Schedule>>(
        `/api/v1/schedules${qs({
          organizationId: filters.organizationId,
          active: filters.active === undefined ? undefined : String(filters.active),
          scheduleType: filters.scheduleType,
          limit: 50,
        })}`,
      ),
    get: (id: string) => apiFetch<Schedule>(`/api/v1/schedules/${id}`),
    pause: (id: string) => apiFetch<Schedule>(`/api/v1/schedules/${id}/pause`, { method: "POST" }),
    resume: (id: string) => apiFetch<Schedule>(`/api/v1/schedules/${id}/resume`, { method: "POST" }),
    preview: (body: { cronExpression: string; timezone?: string; count?: number }) =>
      apiFetch<{ cronExpression: string; timezone: string; from: string; nextRuns: string[] }>(
        "/api/v1/schedules/preview",
        { method: "POST", body: JSON.stringify(body) },
      ),
  },
  dlq: {
    list: (
      filters: {
        organizationId: string;
        projectId?: string;
        queueId?: string;
        resolved?: boolean;
      } = { organizationId: "" },
    ) =>
      apiFetch<Page<DeadLetterEntry>>(
        `/api/v1/dlq${qs({
          organizationId: filters.organizationId,
          projectId: filters.projectId,
          queueId: filters.queueId,
          resolved: filters.resolved === undefined ? undefined : String(filters.resolved),
          limit: 50,
        })}`,
      ),
    get: (id: string) => apiFetch<DeadLetterEntry>(`/api/v1/dlq/${id}`),
    retry: (id: string) =>
      apiFetch<{ deadLetter: DeadLetterEntry; job: Job }>(`/api/v1/dlq/${id}/retry`, {
        method: "POST",
      }),
    discard: (id: string, note?: string) =>
      apiFetch<DeadLetterEntry>(`/api/v1/dlq/${id}/discard`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
    resolve: (id: string, note?: string) =>
      apiFetch<DeadLetterEntry>(`/api/v1/dlq/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
  },
  workers: {
    list: (filters: { status?: string } = {}) =>
      apiFetch<Page<WorkerRow>>(`/api/v1/workers${qs({ status: filters.status, limit: 50 })}`),
    get: (id: string) =>
      apiFetch<
        WorkerRow & {
          inFlightJobs: number;
          recentHeartbeats: Array<{
            id: string;
            heartbeatAt: string;
            currentJobCount: number;
            memoryUsage: number | null;
          }>;
        }
      >(`/api/v1/workers/${id}`),
  },
  jobs: {
    list: (filters: { queueId?: string; projectId?: string; status?: string } = {}) =>
      apiFetch<Page<Job>>(`/api/v1/jobs${qs({ ...filters, limit: 50 })}`),
    get: (id: string) => apiFetch<Job>(`/api/v1/jobs/${id}`),
    create: (body: Record<string, unknown>, idempotencyKey?: string) =>
      apiFetch<{ job: Job; idempotentReplay: boolean }>("/api/v1/jobs", {
        method: "POST",
        body: JSON.stringify(body),
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      }),
    cancel: (id: string) => apiFetch<Job>(`/api/v1/jobs/${id}/cancel`, { method: "POST" }),
    retry: (id: string) => apiFetch<Job>(`/api/v1/jobs/${id}/retry`, { method: "POST" }),
    executions: (id: string) => apiFetch<Page<JobExecution>>(`/api/v1/jobs/${id}/executions?limit=50`),
    execution: (jobId: string, executionId: string) =>
      apiFetch<JobExecutionDetail>(`/api/v1/jobs/${jobId}/executions/${executionId}`),
    logs: (id: string, filters: { executionId?: string; level?: string; limit?: number } = {}) =>
      apiFetch<Page<JobLog>>(
        `/api/v1/jobs/${id}/logs${qs({
          executionId: filters.executionId,
          level: filters.level,
          limit: filters.limit ?? 100,
        })}`,
      ),
  },
};
