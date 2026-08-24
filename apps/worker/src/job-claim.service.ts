import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { WorkerContext } from "./worker-context";
import { RealtimePublisher } from "./realtime.publisher";
import { WorkerMetricsService } from "./worker-metrics.service";
import { DistributedLockService, PROMOTE_LOCK_KEY } from "./distributed-lock.service";
import { DispatchWakePublisher } from "./dispatch-wake.publisher";

export type ClaimedJob = {
  id: string;
  queueId: string;
  projectId: string;
  organizationId: string;
  name: string;
  type: string;
  taskType: string;
  payload: unknown;
  priority: number;
  attempts: number;
  maxAttempts: number;
  retryPolicyId: string | null;
  timeoutMs: number | null;
  executionId: string;
  attemptNumber: number;
  queueMaxConcurrency: number;
};

const CANDIDATE_BATCH = 24;
const PROMOTE_LOCK_TTL_MS = 5_000;

/**
 * Atomic claim: candidate read + per-queue lock + conditional QUEUED→CLAIMED update.
 *
 * We intentionally avoid `SELECT … ORDER BY … LIMIT 1 FOR UPDATE SKIP LOCKED` as the
 * sole concurrency mechanism — under parallel load MySQL often returns no row to
 * waiters instead of the next unlocked candidate. Conditional UPDATE is the source
 * of truth for “who won the job”; the queue row lock is the source of truth for
 * maxConcurrency.
 *
 * See docs/concurrency.md.
 */
@Injectable()
export class JobClaimService {
  private readonly logger = new Logger(JobClaimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: WorkerContext,
    private readonly realtime: RealtimePublisher,
    private readonly metrics: WorkerMetricsService,
    private readonly locks: DistributedLockService,
    private readonly dispatchWake: DispatchWakePublisher,
  ) {}

  /** Move due scheduled/retrying jobs into QUEUED so they become claimable. */
  async promoteDueJobs(): Promise<number> {
    const locked = await this.locks.withLock(PROMOTE_LOCK_KEY, PROMOTE_LOCK_TTL_MS, async () => {
      const now = new Date();
      const scheduled = await this.prisma.job.updateMany({
        where: {
          status: "SCHEDULED",
          scheduledAt: { lte: now },
        },
        data: { status: "QUEUED" },
      });
      const retrying = await this.prisma.job.updateMany({
        where: {
          status: "RETRYING",
          nextRetryAt: { lte: now },
        },
        data: { status: "QUEUED", nextRetryAt: null },
      });
      return scheduled.count + retrying.count;
    });

    if (!locked.acquired) {
      return 0;
    }
    const count = locked.result ?? 0;
    if (count > 0) {
      void this.dispatchWake.wake({ reason: "promote", count });
    }
    return count;
  }

  async claimNext(options?: { queueId?: string }): Promise<ClaimedJob | null> {
    if (!this.ctx.dbId) {
      return null;
    }

    const filterQueueId = options?.queueId;

    return this.prisma.$transaction(
      async (tx) => {
        const candidates = await tx.job.findMany({
          where: {
            status: "QUEUED",
            ...(filterQueueId ? { queueId: filterQueueId } : {}),
            queue: { status: "ACTIVE" },
          },
          orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
          take: CANDIDATE_BATCH,
          select: { id: true, queueId: true },
        });

        if (candidates.length === 0) {
          return null;
        }

        // Prefer staying on one queue once we pick a head candidate (fair enough for Phase 7).
        const queueId = candidates[0]!.queueId;
        const queueCandidates = candidates.filter((c) => c.queueId === queueId);

        const queueRows = await tx.$queryRaw<Array<{ maxConcurrency: number; status: string }>>`
          SELECT maxConcurrency, status
          FROM queues
          WHERE id = ${queueId}
          FOR UPDATE
        `;
        const queue = queueRows[0];
        if (!queue || queue.status !== "ACTIVE") {
          return null;
        }

        let active = await tx.job.count({
          where: {
            queueId,
            status: { in: ["CLAIMED", "RUNNING"] },
          },
        });
        if (active >= queue.maxConcurrency) {
          this.logger.debug(
            JSON.stringify({
              msg: "claim_skipped_capacity",
              queueId,
              active,
              maxConcurrency: queue.maxConcurrency,
            }),
          );
          return null;
        }

        const now = new Date();
        for (const candidate of queueCandidates) {
          if (active >= queue.maxConcurrency) {
            break;
          }

          const claimed = await tx.job.updateMany({
            where: { id: candidate.id, status: "QUEUED" },
            data: {
              status: "CLAIMED",
              lockedAt: now,
              lockedBy: this.ctx.identity.workerId,
              attempts: { increment: 1 },
              startedAt: now,
            },
          });
          if (claimed.count !== 1) {
            continue;
          }

          const updated = await tx.job.findUniqueOrThrow({
            where: { id: candidate.id },
            include: { project: { select: { organizationId: true } } },
          });

          // jobs.attempts is a per-cycle counter (reset on CRON success / manual retry).
          // job_executions.attemptNumber must be monotonic across the job's lifetime so
          // unique (jobId, attemptNumber) survives those resets.
          const prior = await tx.jobExecution.aggregate({
            where: { jobId: updated.id },
            _max: { attemptNumber: true },
          });
          const attemptNumber = (prior._max.attemptNumber ?? 0) + 1;

          const execution = await tx.jobExecution.create({
            data: {
              jobId: updated.id,
              workerId: this.ctx.dbId!,
              attemptNumber,
              status: "CLAIMED",
              startedAt: now,
            },
          });

          await tx.jobLog.create({
            data: {
              jobId: updated.id,
              executionId: execution.id,
              workerId: this.ctx.dbId,
              level: "INFO",
              message: `Claimed by ${this.ctx.identity.workerId}`,
            },
          });

          this.logger.log(
            JSON.stringify({
              msg: "job_claimed",
              jobId: updated.id,
              cycleAttempt: updated.attempts,
              attemptNumber,
              workerId: this.ctx.identity.workerId,
            }),
          );

          const claimedJob: ClaimedJob = {
            id: updated.id,
            queueId: updated.queueId,
            projectId: updated.projectId,
            organizationId: updated.project.organizationId,
            name: updated.name,
            type: updated.type,
            taskType: updated.taskType,
            payload: updated.payload,
            priority: updated.priority,
            attempts: updated.attempts,
            maxAttempts: updated.maxAttempts,
            retryPolicyId: updated.retryPolicyId,
            timeoutMs: updated.timeoutMs,
            executionId: execution.id,
            attemptNumber,
            queueMaxConcurrency: queue.maxConcurrency,
          };

          return claimedJob;
        }

        this.logger.debug(
          JSON.stringify({
            msg: "claim_no_candidate_won",
            queueId,
            tried: queueCandidates.length,
            workerId: this.ctx.identity.workerId,
          }),
        );
        return null;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
    ).then((claimed) => {
      if (claimed) {
        this.metrics.incClaim();
        void this.realtime.jobUpdated(claimed.organizationId, {
          jobId: claimed.id,
          status: "CLAIMED",
          queueId: claimed.queueId,
        });
      }
      return claimed;
    });
  }
}
