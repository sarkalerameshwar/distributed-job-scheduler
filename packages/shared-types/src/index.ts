/**
 * Shared contracts between API, worker, and web.
 */

export const APP_NAME = "distributed-job-scheduler";
export const APP_VERSION = "0.1.0";

export type HealthStatus = "ok" | "degraded" | "down";

export type DependencyCheck = {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  error?: string;
};

export type HealthResponse = {
  status: HealthStatus;
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: DependencyCheck[];
  /** Optional platform snapshot (Phase 15) */
  metrics?: SystemMetricsSnapshot;
};

export type SystemMetricsSnapshot = {
  workersOnline: number;
  workersFailed: number;
  workersTotal: number;
  jobsByStatus: Record<string, number>;
  queueDepth: number;
  jobsRunning: number;
  openDlq: number;
  httpRequestsTotal?: number;
};

export const USER_STATUSES = ["ACTIVE", "DISABLED", "PENDING"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const PROJECT_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const QUEUE_STATUSES = ["ACTIVE", "PAUSED", "DISABLED"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const RETRY_STRATEGIES = ["FIXED", "LINEAR", "EXPONENTIAL"] as const;
export type RetryStrategy = (typeof RETRY_STRATEGIES)[number];

export const JOB_TYPES = ["IMMEDIATE", "DELAYED", "SCHEDULED", "RECURRING", "BATCH"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = [
  "QUEUED",
  "SCHEDULED",
  "CLAIMED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "RETRYING",
  "CANCELLED",
  "DLQ",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const EXECUTION_STATUSES = [
  "CLAIMED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TIMEOUT",
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const WORKER_STATUSES = ["STARTING", "ONLINE", "DRAINING", "OFFLINE", "FAILED"] as const;
export type WorkerStatus = (typeof WORKER_STATUSES)[number];

export const LOG_LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const SCHEDULE_TYPES = ["DELAY", "CRON", "ONE_TIME"] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export const DLQ_RESOLUTIONS = ["RETRIED", "DISCARDED", "RESOLVED"] as const;
export type DlqResolution = (typeof DLQ_RESOLUTIONS)[number];

/** Redis pub/sub channel: worker + API → Socket.IO rooms */
export const REALTIME_REDIS_CHANNEL = "djs:realtime";

export const REALTIME_EVENT_TYPES = [
  "job.updated",
  "queue.updated",
  "dlq.updated",
  "worker.updated",
  "dashboard.refresh",
] as const;
export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number];

export type RealtimeEvent = {
  type: RealtimeEventType;
  /** Org room target; null = platform-wide (workers) */
  organizationId: string | null;
  at: string;
  payload: Record<string, unknown>;
};

export const TASK_TYPES = [
  "send_email",
  "generate_report",
  "send_notification",
  "cleanup",
  "data_export",
  "test_success",
  "test_failure",
  "test_timeout",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export {
  calculateRetryDelay,
  buildRetrySchedule,
  type RetryDelayInput,
  type RetryScheduleEntry,
} from "./retry";

export {
  isValidCronExpression,
  isValidIanaTimezone,
  getNextCronRun,
  getNextCronRuns,
} from "./cron";
