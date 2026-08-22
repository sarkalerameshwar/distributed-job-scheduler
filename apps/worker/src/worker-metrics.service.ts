import { Injectable } from "@nestjs/common";
import { APP_NAME, APP_VERSION } from "@djs/shared-types";

const startedAt = Date.now();

@Injectable()
export class WorkerMetricsService {
  private claims = 0;
  private completions = 0;
  private failures = 0;
  private dlqMoves = 0;
  private recoveries = 0;
  private heartbeats = 0;
  private realtimePublishes = 0;

  incClaim(): void {
    this.claims += 1;
  }

  incCompletion(): void {
    this.completions += 1;
  }

  incFailure(): void {
    this.failures += 1;
  }

  incDlq(): void {
    this.dlqMoves += 1;
  }

  incRecovery(count = 1): void {
    this.recoveries += count;
  }

  incHeartbeat(): void {
    this.heartbeats += 1;
  }

  incRealtimePublish(): void {
    this.realtimePublishes += 1;
  }

  render(activeJobs: number, draining: boolean, workerId: string): string {
    const uptime = Math.floor((Date.now() - startedAt) / 1000);
    return [
      "# HELP djs_worker_up 1 if the worker process is running",
      "# TYPE djs_worker_up gauge",
      `djs_worker_up{worker_id="${escape(workerId)}"} ${draining ? 0 : 1}`,
      "# HELP djs_worker_uptime_seconds Worker process uptime",
      "# TYPE djs_worker_uptime_seconds gauge",
      `djs_worker_uptime_seconds ${uptime}`,
      "# HELP djs_worker_build_info Build metadata",
      "# TYPE djs_worker_build_info gauge",
      `djs_worker_build_info{service="${APP_NAME}-worker",version="${APP_VERSION}"} 1`,
      "# HELP djs_worker_active_jobs Current in-flight jobs",
      "# TYPE djs_worker_active_jobs gauge",
      `djs_worker_active_jobs ${activeJobs}`,
      "# HELP djs_worker_claims_total Jobs claimed by this process",
      "# TYPE djs_worker_claims_total counter",
      `djs_worker_claims_total ${this.claims}`,
      "# HELP djs_worker_completions_total Successful executions",
      "# TYPE djs_worker_completions_total counter",
      `djs_worker_completions_total ${this.completions}`,
      "# HELP djs_worker_failures_total Failed executions (including timeout)",
      "# TYPE djs_worker_failures_total counter",
      `djs_worker_failures_total ${this.failures}`,
      "# HELP djs_worker_dlq_moves_total Jobs moved to DLQ by this process",
      "# TYPE djs_worker_dlq_moves_total counter",
      `djs_worker_dlq_moves_total ${this.dlqMoves}`,
      "# HELP djs_worker_recoveries_total Jobs recovered from stale workers",
      "# TYPE djs_worker_recoveries_total counter",
      `djs_worker_recoveries_total ${this.recoveries}`,
      "# HELP djs_worker_heartbeats_total Heartbeats written",
      "# TYPE djs_worker_heartbeats_total counter",
      `djs_worker_heartbeats_total ${this.heartbeats}`,
      "# HELP djs_worker_realtime_publishes_total Realtime events published",
      "# TYPE djs_worker_realtime_publishes_total counter",
      `djs_worker_realtime_publishes_total ${this.realtimePublishes}`,
      "",
    ].join("\n");
  }
}

function escape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
