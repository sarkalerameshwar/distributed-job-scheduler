import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { RetryStrategy } from "@djs/shared-types";
import { PrismaService } from "./prisma.service";
import { JobExecutor } from "./job-executor";
import { RetryService } from "./retry.service";
import { WorkerContext } from "./worker-context";
import { EnvService } from "./config/env.service";
import type { ClaimedJob } from "./job-claim.service";
import { getNextCronRun } from "./cron-schedule";
import { ExecutionLogService } from "./execution-log.service";
import { RealtimePublisher } from "./realtime.publisher";
import { WorkerMetricsService } from "./worker-metrics.service";

@Injectable()
export class JobProcessorService {
  private readonly logger = new Logger(JobProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: JobExecutor,
    private readonly retry: RetryService,
    private readonly ctx: WorkerContext,
    private readonly env: EnvService,
    private readonly logs: ExecutionLogService,
    private readonly realtime: RealtimePublisher,
    private readonly metrics: WorkerMetricsService,
  ) {}

  async process(job: ClaimedJob): Promise<void> {
    this.ctx.activeJobIds.add(job.id);
    const started = Date.now();

    try {
      if (await this.wasCancelled(job.id)) {
        await this.markCancelled(job, Date.now() - started, "cancelled_before_run");
        return;
      }

      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: "RUNNING" },
      });
      await this.prisma.jobExecution.update({
        where: { id: job.executionId },
        data: { status: "RUNNING", startedAt: new Date() },
      });
      void this.realtime.jobUpdated(job.organizationId, {
        jobId: job.id,
        status: "RUNNING",
        queueId: job.queueId,
      });
      await this.logs.write({
        jobId: job.id,
        executionId: job.executionId,
        level: "INFO",
        message: "Execution started",
        metadata: {
          taskType: job.taskType,
          attempt: job.attemptNumber,
          timeoutMs: job.timeoutMs ?? this.env.jobDefaultTimeoutMs,
        },
      });

      const timeoutMs = job.timeoutMs ?? this.env.jobDefaultTimeoutMs;
      const outcome = await this.executor.execute(job.taskType, job.payload, timeoutMs);
      const durationMs = Date.now() - started;

      if (await this.wasCancelled(job.id)) {
        await this.markCancelled(job, durationMs, "cancelled_during_run");
        return;
      }

      if (outcome.ok) {
        await this.complete(job, outcome.result, durationMs);
      } else {
        await this.fail(job, outcome, durationMs);
      }
    } catch (error) {
      const durationMs = Date.now() - started;
      if (await this.wasCancelled(job.id)) {
        await this.markCancelled(job, durationMs, "cancelled_during_run");
        return;
      }
      const message = error instanceof Error ? error.message : "unknown";
      await this.fail(
        job,
        {
          timedOut: false,
          errorCode: "WORKER_ERROR",
          errorMessage: message,
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        durationMs,
      );
    } finally {
      this.ctx.activeJobIds.delete(job.id);
    }
  }

  private async wasCancelled(jobId: string): Promise<boolean> {
    const row = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    return row?.status === "CANCELLED";
  }

  private async markCancelled(job: ClaimedJob, durationMs: number, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.jobExecution.update({
        where: { id: job.executionId },
        data: {
          status: "CANCELLED",
          completedAt: new Date(),
          durationMs,
          errorCode: "CANCELLED",
          errorMessage: reason,
        },
      });
      await tx.job.update({
        where: { id: job.id },
        data: { lockedAt: null, lockedBy: null },
      });
      await tx.jobLog.create({
        data: {
          jobId: job.id,
          executionId: job.executionId,
          workerId: this.ctx.dbId,
          level: "WARN",
          message: `Execution cancelled (${reason})`,
          metadata: { durationMs },
        },
      });
    });

    this.logger.log(JSON.stringify({ msg: "execution_cancelled", jobId: job.id, reason, durationMs }));
    void this.realtime.jobUpdated(job.organizationId, {
      jobId: job.id,
      status: "CANCELLED",
      queueId: job.queueId,
    });
  }

  private async complete(job: ClaimedJob, result: Record<string, unknown>, durationMs: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Do not overwrite a user cancel that landed mid-flight.
      const current = await tx.job.findUnique({ where: { id: job.id }, select: { status: true } });
      if (current?.status === "CANCELLED") {
        await tx.jobExecution.update({
          where: { id: job.executionId },
          data: {
            status: "CANCELLED",
            completedAt: new Date(),
            durationMs,
            errorCode: "CANCELLED",
            errorMessage: "cancelled_before_persist",
          },
        });
        return;
      }

      await tx.jobExecution.update({
        where: { id: job.executionId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          durationMs,
          result: result as Prisma.InputJsonValue,
        },
      });
      await tx.job.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          failedAt: null,
        },
      });
      await tx.jobLog.create({
        data: {
          jobId: job.id,
          executionId: job.executionId,
          workerId: this.ctx.dbId,
          level: "INFO",
          message: "Execution completed",
          metadata: { durationMs, resultKeys: Object.keys(result) },
        },
      });

      const schedule = await tx.scheduledJob.findUnique({ where: { jobId: job.id } });
      if (schedule?.scheduleType === "CRON" && schedule.cronExpression) {
        // Always advance nextRunAt after a successful CRON run. If the schedule was
        // paused mid-flight, keep the job COMPLETED and mark lastRunAt; resume will re-arm.
        const nextRunAt = getNextCronRun(schedule.cronExpression, {
          from: new Date(),
          timezone: schedule.timezone || "UTC",
        });
        await tx.scheduledJob.update({
          where: { id: schedule.id },
          data: { lastRunAt: new Date(), nextRunAt },
        });
        if (schedule.active) {
          await tx.job.update({
            where: { id: job.id },
            data: {
              status: "SCHEDULED",
              scheduledAt: nextRunAt,
              completedAt: null,
              attempts: 0,
              startedAt: null,
              failedAt: null,
              nextRetryAt: null,
              lockedAt: null,
              lockedBy: null,
            },
          });
          await tx.jobLog.create({
            data: {
              jobId: job.id,
              executionId: job.executionId,
              workerId: this.ctx.dbId,
              level: "INFO",
              message: "Recurring job rescheduled",
              metadata: {
                nextRunAt: nextRunAt.toISOString(),
                cronExpression: schedule.cronExpression,
                timezone: schedule.timezone,
              },
            },
          });
        } else {
          await tx.jobLog.create({
            data: {
              jobId: job.id,
              executionId: job.executionId,
              workerId: this.ctx.dbId,
              level: "WARN",
              message: "CRON run completed while schedule paused — not rescheduled onto the queue",
              metadata: { nextRunAt: nextRunAt.toISOString() },
            },
          });
        }
      } else if (schedule && (schedule.scheduleType === "DELAY" || schedule.scheduleType === "ONE_TIME")) {
        await tx.scheduledJob.update({
          where: { id: schedule.id },
          data: { active: false, lastRunAt: new Date() },
        });
      }
    });

    const final = await this.prisma.job.findUnique({
      where: { id: job.id },
      select: { status: true },
    });
    void this.realtime.jobUpdated(job.organizationId, {
      jobId: job.id,
      status: final?.status ?? "COMPLETED",
      queueId: job.queueId,
    });
    this.metrics.incCompletion();
    this.logger.log(JSON.stringify({ msg: "job_completed", jobId: job.id, durationMs }));
  }

  private async fail(
    job: ClaimedJob,
    outcome: {
      timedOut: boolean;
      errorCode: string;
      errorMessage: string;
      errorStack?: string;
    },
    durationMs: number,
  ): Promise<void> {
    const policy = job.retryPolicyId
      ? await this.prisma.retryPolicy.findUnique({ where: { id: job.retryPolicyId } })
      : null;

    const maxAttempts = job.maxAttempts;
    const attempts = job.attempts;
    const canRetry = attempts < maxAttempts;

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.job.findUnique({ where: { id: job.id }, select: { status: true } });
      if (current?.status === "CANCELLED") {
        await tx.jobExecution.update({
          where: { id: job.executionId },
          data: {
            status: "CANCELLED",
            completedAt: new Date(),
            durationMs,
            errorCode: "CANCELLED",
            errorMessage: "cancelled_before_fail_persist",
          },
        });
        return;
      }

      await tx.jobExecution.update({
        where: { id: job.executionId },
        data: {
          status: outcome.timedOut ? "TIMEOUT" : "FAILED",
          completedAt: new Date(),
          durationMs,
          errorCode: outcome.errorCode,
          errorMessage: outcome.errorMessage.slice(0, 1024),
          errorStack: outcome.errorStack,
        },
      });

      await tx.jobLog.create({
        data: {
          jobId: job.id,
          executionId: job.executionId,
          workerId: this.ctx.dbId,
          level: "ERROR",
          message: outcome.timedOut
            ? `Execution timed out: ${outcome.errorMessage}`.slice(0, 2048)
            : outcome.errorMessage.slice(0, 2048),
          metadata: { errorCode: outcome.errorCode, timedOut: outcome.timedOut },
        },
      });

      if (canRetry && policy) {
        const delayMs = this.retry.calculateDelay({
          strategy: policy.strategy as RetryStrategy,
          attempt: attempts,
          initialDelayMs: policy.initialDelayMs,
          maxDelayMs: policy.maxDelayMs,
          multiplier: Number(policy.multiplier),
        });
        const nextRetryAt = new Date(Date.now() + delayMs);
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: "RETRYING",
            failedAt: new Date(),
            nextRetryAt,
            lockedAt: null,
            lockedBy: null,
          },
        });
        await tx.jobLog.create({
          data: {
            jobId: job.id,
            executionId: job.executionId,
            workerId: this.ctx.dbId,
            level: "WARN",
            message: `Retry scheduled in ${delayMs}ms via ${policy.strategy} (attempt ${attempts}/${maxAttempts})`,
            metadata: {
              delayMs,
              strategy: policy.strategy,
              nextRetryAt: nextRetryAt.toISOString(),
            },
          },
        });
        this.logger.log(
          JSON.stringify({
            msg: "job_retry_scheduled",
            jobId: job.id,
            attempt: attempts,
            delayMs,
            strategy: policy.strategy,
          }),
        );
        return;
      }

      if (canRetry && !policy) {
        // Fallback FIXED backoff when a job has no policy attached.
        const delayMs = this.retry.calculateDelay({
          strategy: "FIXED",
          attempt: attempts,
          initialDelayMs: 1_000,
          maxDelayMs: 60_000,
          multiplier: 1,
        });
        const nextRetryAt = new Date(Date.now() + delayMs);
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: "RETRYING",
            failedAt: new Date(),
            nextRetryAt,
            lockedAt: null,
            lockedBy: null,
          },
        });
        await tx.jobLog.create({
          data: {
            jobId: job.id,
            executionId: job.executionId,
            workerId: this.ctx.dbId,
            level: "WARN",
            message: `Retry scheduled in ${delayMs}ms via default FIXED policy (attempt ${attempts}/${maxAttempts})`,
            metadata: { delayMs, strategy: "FIXED", nextRetryAt: nextRetryAt.toISOString() },
          },
        });
        return;
      }

      await tx.job.update({
        where: { id: job.id },
        data: {
          status: "DLQ",
          failedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          nextRetryAt: null,
        },
      });
      // Pause recurring schedule until an operator retries — avoids hammering a permanently failing job.
      await tx.scheduledJob.updateMany({
        where: { jobId: job.id, active: true },
        data: { active: false },
      });
      await tx.deadLetterJob.upsert({
        where: { jobId: job.id },
        create: {
          jobId: job.id,
          finalExecutionId: job.executionId,
          reason: "max_attempts_exhausted",
          finalError: outcome.errorMessage,
          attempts,
        },
        update: {
          finalExecutionId: job.executionId,
          reason: "max_attempts_exhausted",
          finalError: outcome.errorMessage,
          attempts,
          resolvedAt: null,
          resolution: null,
          movedAt: new Date(),
        },
      });
      await tx.jobLog.create({
        data: {
          jobId: job.id,
          executionId: job.executionId,
          workerId: this.ctx.dbId,
          level: "ERROR",
          message: "Moved to dead letter queue after exhausting attempts",
          metadata: { attempts, maxAttempts },
        },
      });
      this.logger.warn(JSON.stringify({ msg: "job_moved_to_dlq", jobId: job.id, attempts }));
    });

    const final = await this.prisma.job.findUnique({
      where: { id: job.id },
      select: { status: true },
    });
    void this.realtime.jobUpdated(job.organizationId, {
      jobId: job.id,
      status: final?.status ?? "FAILED",
      queueId: job.queueId,
    });
    this.metrics.incFailure();
    if (final?.status === "DLQ") {
      this.metrics.incDlq();
      void this.realtime.dlqUpdated(job.organizationId, {
        jobId: job.id,
        reason: "max_attempts_exhausted",
      });
    }
  }
}
