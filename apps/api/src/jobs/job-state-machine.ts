import type { JobStatus } from "@djs/shared-types";
import { HttpStatus } from "@nestjs/common";
import { AppError } from "../common/errors/app-error";

/**
 * Job status is a current-state cache. Attempt history lives in JobExecution.
 * Workers (later phases) own CLAIMED → RUNNING → COMPLETED/FAILED transitions.
 * The API only allows human-driven transitions: cancel and retry-from-terminal.
 * Attempt history always lives in JobExecution — never treat Job.status as the audit trail.
 */
const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  QUEUED: ["CLAIMED", "CANCELLED"],
  SCHEDULED: ["QUEUED", "CANCELLED"],
  CLAIMED: ["RUNNING", "FAILED", "CANCELLED"],
  RUNNING: ["COMPLETED", "FAILED", "CANCELLED"],
  FAILED: ["RETRYING", "DLQ", "CANCELLED"],
  RETRYING: ["QUEUED", "SCHEDULED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  DLQ: ["QUEUED"],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_JOB_TRANSITION", "Invalid job status transition", {
      from,
      to,
    });
  }
}

export function isCancellable(status: JobStatus): boolean {
  return (
    status === "QUEUED" ||
    status === "SCHEDULED" ||
    status === "RETRYING" ||
    status === "CLAIMED" ||
    status === "RUNNING"
  );
}

export function isManuallyRetryable(status: JobStatus): boolean {
  return status === "FAILED" || status === "DLQ" || status === "CANCELLED";
}
