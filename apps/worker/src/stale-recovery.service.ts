import { Injectable, Logger } from "@nestjs/common";
import type { RetryStrategy } from "@djs/shared-types";
import { PrismaService } from "./prisma.service";
import { EnvService } from "./config/env.service";
import { RetryService } from "./retry.service";
import { RealtimePublisher } from "./realtime.publisher";
import { WorkerMetricsService } from "./worker-metrics.service";
import { DistributedLockService, STALE_RECOVERY_LOCK_KEY } from "./distributed-lock.service";

export type RecoveryStats = {
  staleWorkers: number;
  recoveredJobs: number;
  prunedHeartbeats: number;
};

/**
 * Phase 12 — detect workers that stopped heartbeating and free their in-flight jobs.
 *
 * Any online worker may run this; a Redis lock elects one recoverer per interval.
 * Per-job recovery still uses conditional UPDATEs so concurrent recoverers cannot
 * double-apply outcomes if the lock is skipped or expired.
 */
@Injectable()
export class StaleRecoveryService {
  private readonly logger = new Logger(StaleRecoveryService.name);
  private lastPruneAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
    private readonly retry: RetryService,
    private readonly realtime: RealtimePublisher,
    private readonly metrics: WorkerMetricsService,
    private readonly locks: DistributedLockService,
  ) {}

  async run(): Promise<RecoveryStats> {
    const ttlMs = Math.max(this.env.recoveryIntervalMs * 2, 15_000);
    const locked = await this.locks.withLock(STALE_RECOVERY_LOCK_KEY, ttlMs, async () => {
      const staleWorkers = await this.markStaleWorkers();
      const recoveredJobs = await this.recoverOrphanedJobs();
      const prunedHeartbeats = await this.pruneHeartbeatsIfDue();
      return { staleWorkers, recoveredJobs, prunedHeartbeats };
    });

    if (!locked.acquired || !locked.result) {
      return { staleWorkers: 0, recoveredJobs: 0, prunedHeartbeats: 0 };
    }

    const { staleWorkers, recoveredJobs, prunedHeartbeats } = locked.result;
    if (staleWorkers > 0 || recoveredJobs > 0 || prunedHeartbeats > 0) {
      this.logger.log(
        JSON.stringify({
          msg: "stale_recovery",
          staleWorkers,
          recoveredJobs,
          prunedHeartbeats,
          heartbeatTimeoutMs: this.env.heartbeatTimeoutMs,
        }),
      );
    }

    return locked.result;
  }

  private async markStaleWorkers(): Promise<number> {
    const cutoff = new Date(Date.now() - this.env.heartbeatTimeoutMs);
    const result = await this.prisma.worker.updateMany({
      where: {
        status: { in: ["STARTING", "ONLINE", "DRAINING"] },
        OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: cutoff } }],
      },
      data: {
        status: "FAILED",
        stoppedAt: new Date(),
        currentJobCount: 0,
      },
    });
    if (result.count > 0) {
      void this.realtime.workerUpdated({ status: "FAILED", count: result.count, reason: "heartbeat_timeout" });
    }
    return result.count;
  }

  private async recoverOrphanedJobs(): Promise<number> {
    const cutoff = new Date(Date.now() - this.env.heartbeatTimeoutMs);
    const stuck = await this.prisma.job.findMany({
      where: {
        status: { in: ["CLAIMED", "RUNNING"] },
        lockedBy: { not: null },
      },
      take: 50,
      orderBy: { lockedAt: "asc" },
      select: {
        id: true,
        lockedBy: true,
        attempts: true,
        maxAttempts: true,
        retryPolicyId: true,
        lockedAt: true,
      },
    });

    let recovered = 0;
    for (const job of stuck) {
      if (!job.lockedBy) continue;

      const worker = await this.prisma.worker.findUnique({
        where: { workerId: job.lockedBy },
        select: { id: true, status: true, lastHeartbeatAt: true, workerId: true },
      });

      const workerDead =
        !worker ||
        worker.status === "FAILED" ||
        worker.status === "OFFLINE" ||
        !worker.lastHeartbeatAt ||
        worker.lastHeartbeatAt < cutoff;

      if (!workerDead) {
        continue;
      }

      const ok = await this.recoverOneJob(job.id, job.lockedBy, {
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        retryPolicyId: job.retryPolicyId,
        workerDbId: worker?.id ?? null,
      });
      if (ok) {
        recovered += 1;
        this.metrics.incRecovery();
        const org = await this.prisma.job.findUnique({
          where: { id: job.id },
          select: { status: true, queueId: true, project: { select: { organizationId: true } } },
        });
        if (org) {
          void this.realtime.jobUpdated(org.project.organizationId, {
            jobId: job.id,
            status: org.status,
            queueId: org.queueId,
            recovered: true,
          });
          if (org.status === "DLQ") {
            void this.realtime.dlqUpdated(org.project.organizationId, {
              jobId: job.id,
              reason: "worker_heartbeat_timeout",
            });
          }
        }
      }
    }
    return recovered;
  }

  private async recoverOneJob(
    jobId: string,
    lockedBy: string,
    meta: {
      attempts: number;
      maxAttempts: number;
      retryPolicyId: string | null;
      workerDbId: string | null;
    },
  ): Promise<boolean> {
    const policy = meta.retryPolicyId
      ? await this.prisma.retryPolicy.findUnique({ where: { id: meta.retryPolicyId } })
      : null;

    const canRetry = meta.attempts < meta.maxAttempts;
    const errorCode = "WORKER_HEARTBEAT_TIMEOUT";
    const errorMessage = `Worker ${lockedBy} missed heartbeat; job recovered`;

    let delayMs = 0;
    let nextRetryAt: Date | null = null;
    if (canRetry) {
      delayMs = this.retry.calculateDelay({
        strategy: (policy?.strategy as RetryStrategy) ?? "FIXED",
        attempt: meta.attempts,
        initialDelayMs: policy?.initialDelayMs ?? 1_000,
        maxDelayMs: policy?.maxDelayMs ?? 60_000,
        multiplier: policy ? Number(policy.multiplier) : 1,
      });
      nextRetryAt = new Date(Date.now() + delayMs);
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.job.updateMany({
        where: {
          id: jobId,
          status: { in: ["CLAIMED", "RUNNING"] },
          lockedBy,
        },
        data: canRetry
          ? {
              status: "RETRYING",
              lockedAt: null,
              lockedBy: null,
              nextRetryAt,
              failedAt: new Date(),
            }
          : {
              status: "DLQ",
              lockedAt: null,
              lockedBy: null,
              nextRetryAt: null,
              failedAt: new Date(),
            },
      });
      if (claimed.count === 0) {
        return false;
      }

      const openExec = await tx.jobExecution.findFirst({
        where: {
          jobId,
          status: { in: ["CLAIMED", "RUNNING"] },
        },
        orderBy: { attemptNumber: "desc" },
      });

      if (openExec) {
        const durationMs = openExec.startedAt
          ? Math.max(0, Date.now() - openExec.startedAt.getTime())
          : null;
        await tx.jobExecution.update({
          where: { id: openExec.id },
          data: {
            status: "TIMEOUT",
            completedAt: new Date(),
            durationMs,
            errorCode,
            errorMessage: errorMessage.slice(0, 1024),
          },
        });
      }

      await tx.jobLog.create({
        data: {
          jobId,
          executionId: openExec?.id,
          workerId: meta.workerDbId ?? undefined,
          level: "ERROR",
          message: errorMessage.slice(0, 2048),
          metadata: { errorCode, recovered: true },
        },
      });

      if (canRetry && nextRetryAt) {
        await tx.jobLog.create({
          data: {
            jobId,
            executionId: openExec?.id,
            workerId: meta.workerDbId ?? undefined,
            level: "WARN",
            message: `Recovered job scheduled for retry in ${delayMs}ms (attempt ${meta.attempts}/${meta.maxAttempts})`,
            metadata: { delayMs, nextRetryAt: nextRetryAt.toISOString(), recovered: true },
          },
        });
        return true;
      }

      await tx.scheduledJob.updateMany({
        where: { jobId, active: true },
        data: { active: false },
      });
      await tx.deadLetterJob.upsert({
        where: { jobId },
        create: {
          jobId,
          finalExecutionId: openExec?.id ?? null,
          reason: "worker_heartbeat_timeout",
          finalError: errorMessage,
          attempts: meta.attempts,
        },
        update: {
          finalExecutionId: openExec?.id ?? null,
          reason: "worker_heartbeat_timeout",
          finalError: errorMessage,
          attempts: meta.attempts,
          resolvedAt: null,
          resolution: null,
          movedAt: new Date(),
        },
      });
      await tx.jobLog.create({
        data: {
          jobId,
          executionId: openExec?.id,
          workerId: meta.workerDbId ?? undefined,
          level: "ERROR",
          message: "Recovered job moved to DLQ after exhausted attempts",
          metadata: { recovered: true },
        },
      });
      return true;
    });
  }

  private async pruneHeartbeatsIfDue(): Promise<number> {
    const now = Date.now();
    // At most once per hour per process.
    if (now - this.lastPruneAt < 60 * 60 * 1000) {
      return 0;
    }
    this.lastPruneAt = now;
    const cutoff = new Date(now - this.env.heartbeatRetentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.workerHeartbeat.deleteMany({
      where: { heartbeatAt: { lt: cutoff } },
    });
    return result.count;
  }
}
