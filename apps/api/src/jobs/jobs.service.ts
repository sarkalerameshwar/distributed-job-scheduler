import { HttpStatus, Injectable } from "@nestjs/common";
import type { JobStatus } from "@djs/shared-types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { RbacService } from "../auth/rbac.service";
import { EnvService } from "../config/env.service";
import { AppError } from "../common/errors/app-error";
import { paginatedResult, toSkipTake } from "../common/pagination";
import { assertTransition, isCancellable, isManuallyRetryable } from "./job-state-machine";
import { getNextCronRun, isValidCronExpression, isValidIanaTimezone } from "./cron.util";
import type { CreateBatchJobsDto, CreateJobDto, CreateJobItemDto, ListJobsQueryDto } from "./dto/job.dto";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { DispatchWakePublisher } from "../realtime/dispatch-wake.publisher";

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly env: EnvService,
    private readonly realtime: RealtimePublisher,
    private readonly dispatchWake: DispatchWakePublisher,
  ) {}

  async create(userId: string, dto: CreateJobDto, idempotencyHeader?: string) {
    const { queue } = await this.rbac.assertQueueAccess(userId, dto.queueId, "MEMBER");
    if (queue.status === "DISABLED") {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "QUEUE_DISABLED", "Cannot enqueue jobs on a disabled queue");
    }

    const idempotencyKey = dto.idempotencyKey ?? idempotencyHeader;
    if (idempotencyKey) {
      const existing = await this.prisma.job.findUnique({
        where: { projectId_idempotencyKey: { projectId: queue.projectId, idempotencyKey } },
        include: { schedule: true, queue: { include: { project: true } } },
      });
      if (existing) {
        return { job: this.toView(existing), idempotentReplay: true };
      }
    }

    const prepared = await this.prepareJobFields(dto, queue, idempotencyKey);
    try {
      const job = await this.prisma.$transaction(async (tx) => {
        const created = await tx.job.create({
          data: {
            projectId: queue.projectId,
            queueId: queue.id,
            createdByUserId: userId,
            name: prepared.name,
            type: prepared.type,
            taskType: prepared.taskType,
            payload: prepared.payload as Prisma.InputJsonValue,
            status: prepared.status,
            priority: prepared.priority,
            attempts: 0,
            maxAttempts: prepared.maxAttempts,
            retryPolicyId: prepared.retryPolicyId,
            idempotencyKey: prepared.idempotencyKey,
            scheduledAt: prepared.scheduledAt,
            timeoutMs: prepared.timeoutMs,
          },
        });

        if (prepared.schedule) {
          await tx.scheduledJob.create({
            data: {
              jobId: created.id,
              scheduleType: prepared.schedule.scheduleType,
              cronExpression: prepared.schedule.cronExpression,
              timezone: prepared.schedule.timezone,
              nextRunAt: prepared.schedule.nextRunAt,
              active: true,
            },
          });
        }

        await tx.jobLog.create({
          data: {
            jobId: created.id,
            level: "INFO",
            message: `Job created (${prepared.type})`,
            metadata: { taskType: prepared.taskType, status: prepared.status },
          },
        });

        return tx.job.findUniqueOrThrow({
          where: { id: created.id },
          include: { schedule: true, queue: { include: { project: true } } },
        });
      });

      const view = this.toView(job);
      void this.realtime.jobUpdated(queue.project.organizationId, {
        jobId: view.id,
        status: view.status,
        queueId: view.queueId,
      });
      if (view.status === "QUEUED") {
        void this.dispatchWake.wake({
          reason: "job.queued",
          queueId: view.queueId,
          jobId: view.id,
        });
      }
      return { job: view, idempotentReplay: false };
    } catch (error) {
      if (idempotencyKey) {
        const existing = await this.prisma.job.findUnique({
          where: { projectId_idempotencyKey: { projectId: queue.projectId, idempotencyKey } },
          include: { schedule: true, queue: { include: { project: true } } },
        });
        if (existing) {
          return { job: this.toView(existing), idempotentReplay: true };
        }
      }
      throw error;
    }
  }

  async createBatch(userId: string, dto: CreateBatchJobsDto) {
    const { queue } = await this.rbac.assertQueueAccess(userId, dto.queueId, "MEMBER");
    if (queue.status === "DISABLED") {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "QUEUE_DISABLED", "Cannot enqueue jobs on a disabled queue");
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.jobBatch.create({
        data: { queueId: queue.id, createdByUserId: userId },
      });

      const created = [];
      for (const item of dto.jobs) {
        const fields = await this.prepareBatchItem(item, queue);
        if (fields.idempotencyKey) {
          const existing = await tx.job.findUnique({
            where: {
              projectId_idempotencyKey: { projectId: queue.projectId, idempotencyKey: fields.idempotencyKey },
            },
          });
          if (existing) {
            created.push(this.toView({ ...existing, queue: { ...queue, project: queue.project } }));
            continue;
          }
        }
        const job = await tx.job.create({
          data: {
            projectId: queue.projectId,
            queueId: queue.id,
            batchId: batch.id,
            createdByUserId: userId,
            name: fields.name,
            type: fields.type,
            taskType: fields.taskType,
            payload: fields.payload as Prisma.InputJsonValue,
            status: "QUEUED",
            priority: fields.priority,
            attempts: 0,
            maxAttempts: fields.maxAttempts,
            retryPolicyId: fields.retryPolicyId,
            idempotencyKey: fields.idempotencyKey,
            timeoutMs: fields.timeoutMs,
          },
          include: { queue: { include: { project: true } } },
        });
        created.push(this.toView(job));
      }

      return { batchId: batch.id, jobs: created };
    }).then(async (result) => {
      void this.realtime.jobUpdated(queue.project.organizationId, {
        queueId: queue.id,
        batchId: result.batchId,
        count: result.jobs.length,
      });
      if (result.jobs.length > 0) {
        void this.dispatchWake.wake({
          reason: "job.batch",
          queueId: queue.id,
          count: result.jobs.length,
        });
      }
      return result;
    });
  }

  async list(userId: string, query: ListJobsQueryDto) {
    const queueIds = await this.visibleQueueIds(userId, query);
    if (queueIds.length === 0) {
      return paginatedResult([], 0, query.page, query.limit);
    }

    const where: Prisma.JobWhereInput = {
      queueId: query.queueId ? query.queueId : { in: queueIds },
      projectId: query.projectId,
      status: query.status,
      taskType: query.taskType,
      priority: query.priority,
      createdAt: {
        gte: query.createdFrom ? new Date(query.createdFrom) : undefined,
        lte: query.createdTo ? new Date(query.createdTo) : undefined,
      },
    };

    const sortBy = query.sortBy ?? "createdAt";
    const sortOrder = query.sortOrder ?? "desc";
    const orderBy: Prisma.JobOrderByWithRelationInput =
      sortBy === "priority"
        ? { priority: sortOrder }
        : sortBy === "status"
          ? { status: sortOrder }
          : { createdAt: sortOrder };

    const total = await this.prisma.job.count({ where });
    const jobs = await this.prisma.job.findMany({
      where,
      include: { queue: { include: { project: true } }, schedule: true },
      orderBy,
      ...toSkipTake(query.page, query.limit),
    });

    return paginatedResult(
      jobs.map((job) => this.toView(job)),
      total,
      query.page,
      query.limit,
    );
  }

  async get(userId: string, id: string) {
    const { job } = await this.rbac.assertJobAccess(userId, id, "VIEWER");
    return this.toView(job);
  }

  async cancel(userId: string, id: string) {
    const { job } = await this.rbac.assertJobAccess(userId, id, "MEMBER");
    if (!isCancellable(job.status)) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "JOB_NOT_CANCELLABLE", "Job cannot be cancelled in its current status", {
        status: job.status,
      });
    }
    assertTransition(job.status, "CANCELLED");

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.job.update({
        where: { id },
        data: {
          status: "CANCELLED",
          lockedAt: null,
          lockedBy: null,
          nextRetryAt: null,
        },
        include: { queue: { include: { project: true } }, schedule: true },
      });
      if (job.schedule) {
        await tx.scheduledJob.update({
          where: { jobId: id },
          data: { active: false },
        });
      }

      // Close any open attempt records so history reflects the cancel.
      const openExecutions = await tx.jobExecution.findMany({
        where: { jobId: id, status: { in: ["CLAIMED", "RUNNING"] } },
        select: { id: true },
      });
      if (openExecutions.length > 0) {
        await tx.jobExecution.updateMany({
          where: { id: { in: openExecutions.map((e) => e.id) } },
          data: {
            status: "CANCELLED",
            completedAt: new Date(),
            errorCode: "CANCELLED",
            errorMessage: "cancelled_by_user",
          },
        });
      }

      await tx.jobLog.create({
        data: {
          jobId: id,
          executionId: openExecutions[0]?.id,
          level: "WARN",
          message: "Job cancelled by user",
          metadata: { closedExecutions: openExecutions.length },
        },
      });
      return next;
    });

    void this.realtime.jobUpdated(updated.queue.project.organizationId, {
      jobId: updated.id,
      status: updated.status,
      queueId: updated.queueId,
    });
    return this.toView(updated);
  }

  /**
   * Manual retry from FAILED / DLQ / CANCELLED.
   * Resets attempts for a fresh run; does not delete prior JobExecution history.
   */
  async retry(userId: string, id: string) {
    const { job } = await this.rbac.assertJobAccess(userId, id, "MEMBER");
    if (!isManuallyRetryable(job.status)) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "JOB_NOT_RETRYABLE", "Job cannot be retried in its current status", {
        status: job.status,
      });
    }

    if (job.status === "DLQ") {
      assertTransition("DLQ", "QUEUED");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (job.deadLetterJob) {
        await tx.deadLetterJob.update({
          where: { jobId: id },
          data: { resolution: "RETRIED", resolvedAt: new Date() },
        });
      }

      const schedule = await tx.scheduledJob.findUnique({ where: { jobId: id } });
      let status: JobStatus = "QUEUED";
      let scheduledAt: Date | null = null;

      if (schedule?.scheduleType === "CRON" && schedule.cronExpression) {
        const nextRunAt = getNextCronRun(schedule.cronExpression, {
          timezone: schedule.timezone || "UTC",
        });
        await tx.scheduledJob.update({
          where: { id: schedule.id },
          data: { active: true, nextRunAt },
        });
        status = "SCHEDULED";
        scheduledAt = nextRunAt;
      }

      const next = await tx.job.update({
        where: { id },
        data: {
          status,
          attempts: 0,
          failedAt: null,
          completedAt: null,
          startedAt: null,
          lockedAt: null,
          lockedBy: null,
          nextRetryAt: null,
          scheduledAt,
        },
        include: { queue: { include: { project: true } }, schedule: true },
      });
      await tx.jobLog.create({
        data: {
          jobId: id,
          level: "INFO",
          message:
            status === "SCHEDULED"
              ? "Job manually re-scheduled from operator retry"
              : "Job manually re-queued",
          metadata: scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : undefined,
        },
      });
      return next;
    });

    void this.realtime.jobUpdated(updated.queue.project.organizationId, {
      jobId: updated.id,
      status: updated.status,
      queueId: updated.queueId,
    });
    if (job.status === "DLQ") {
      void this.realtime.dlqUpdated(updated.queue.project.organizationId, {
        jobId: updated.id,
        resolution: "RETRIED",
      });
    }
    if (updated.status === "QUEUED") {
      void this.dispatchWake.wake({
        reason: "job.retry",
        queueId: updated.queueId,
        jobId: updated.id,
      });
    }
    return this.toView(updated);
  }

  async listExecutions(userId: string, jobId: string, page: number, limit: number) {
    await this.rbac.assertJobAccess(userId, jobId, "VIEWER");
    const where = { jobId };
    const total = await this.prisma.jobExecution.count({ where });
    const executions = await this.prisma.jobExecution.findMany({
      where,
      include: { worker: { select: { workerId: true, hostname: true } } },
      orderBy: { attemptNumber: "asc" },
      ...toSkipTake(page, limit),
    });
    return paginatedResult(
      executions.map((e) => this.toExecutionSummary(e)),
      total,
      page,
      limit,
    );
  }

  async getExecution(userId: string, jobId: string, executionId: string) {
    await this.rbac.assertJobAccess(userId, jobId, "VIEWER");
    const execution = await this.prisma.jobExecution.findFirst({
      where: { id: executionId, jobId },
      include: { worker: { select: { workerId: true, hostname: true, version: true } } },
    });
    if (!execution) {
      throw new AppError(HttpStatus.NOT_FOUND, "EXECUTION_NOT_FOUND", "Execution not found");
    }
    const logs = await this.prisma.jobLog.findMany({
      where: { executionId },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return {
      ...this.toExecutionDetail(execution),
      logs: logs.map((log) => ({
        id: log.id,
        level: log.level,
        message: log.message,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  async listLogs(
    userId: string,
    jobId: string,
    page: number,
    limit: number,
    filters: { executionId?: string; level?: string } = {},
  ) {
    await this.rbac.assertJobAccess(userId, jobId, "VIEWER");
    const where = {
      jobId,
      ...(filters.executionId ? { executionId: filters.executionId } : {}),
      ...(filters.level ? { level: filters.level as "DEBUG" | "INFO" | "WARN" | "ERROR" } : {}),
    };
    const total = await this.prisma.jobLog.count({ where });
    const logs = await this.prisma.jobLog.findMany({
      where,
      orderBy: { createdAt: "asc" },
      ...toSkipTake(page, limit),
    });
    return paginatedResult(
      logs.map((log) => ({
        id: log.id,
        jobId: log.jobId,
        executionId: log.executionId,
        workerId: log.workerId,
        level: log.level,
        message: log.message,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    );
  }

  private toExecutionSummary(e: {
    id: string;
    jobId: string;
    workerId: string | null;
    attemptNumber: number;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    durationMs: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    result: unknown;
    createdAt: Date;
    worker?: { workerId: string; hostname: string } | null;
  }) {
    return {
      id: e.id,
      jobId: e.jobId,
      workerId: e.workerId,
      workerIdentity: e.worker?.workerId ?? null,
      hostname: e.worker?.hostname ?? null,
      attemptNumber: e.attemptNumber,
      status: e.status,
      startedAt: e.startedAt?.toISOString() ?? null,
      completedAt: e.completedAt?.toISOString() ?? null,
      durationMs: e.durationMs,
      errorCode: e.errorCode,
      errorMessage: e.errorMessage,
      hasResult: e.result != null,
      createdAt: e.createdAt.toISOString(),
    };
  }

  private toExecutionDetail(
    e: {
      id: string;
      jobId: string;
      workerId: string | null;
      attemptNumber: number;
      status: string;
      startedAt: Date | null;
      completedAt: Date | null;
      durationMs: number | null;
      errorCode: string | null;
      errorMessage: string | null;
      errorStack: string | null;
      result: unknown;
      createdAt: Date;
      worker?: { workerId: string; hostname: string; version?: string } | null;
    },
  ) {
    return {
      ...this.toExecutionSummary(e),
      errorStack: e.errorStack,
      result: e.result,
      workerVersion: e.worker?.version ?? null,
    };
  }

  private async prepareJobFields(
    dto: CreateJobDto,
    queue: { id: string; projectId: string; defaultPriority: number; retryPolicyId: string; project: { organizationId: string } },
    idempotencyKey?: string | null,
  ) {
    const type = dto.type;
    let status: JobStatus = "QUEUED";
    let scheduledAt: Date | null = null;
    let schedule:
      | { scheduleType: "DELAY" | "CRON" | "ONE_TIME"; cronExpression: string | null; timezone: string; nextRunAt: Date }
      | null = null;

    if (type === "IMMEDIATE" || type === "BATCH") {
      status = "QUEUED";
    } else if (type === "DELAYED") {
      if (dto.scheduledAt) {
        scheduledAt = new Date(dto.scheduledAt);
      } else if (dto.delayMs !== undefined) {
        scheduledAt = new Date(Date.now() + dto.delayMs);
      } else {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "SCHEDULE_REQUIRED", "DELAYED jobs require scheduledAt or delayMs");
      }
      if (scheduledAt.getTime() <= Date.now()) {
        status = "QUEUED";
      } else {
        status = "SCHEDULED";
        schedule = {
          scheduleType: "DELAY",
          cronExpression: null,
          timezone: dto.timezone ?? "UTC",
          nextRunAt: scheduledAt,
        };
      }
    } else if (type === "SCHEDULED") {
      if (!dto.scheduledAt) {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "SCHEDULE_REQUIRED", "SCHEDULED jobs require scheduledAt");
      }
      scheduledAt = new Date(dto.scheduledAt);
      status = scheduledAt.getTime() <= Date.now() ? "QUEUED" : "SCHEDULED";
      if (status === "SCHEDULED") {
        schedule = {
          scheduleType: "ONE_TIME",
          cronExpression: null,
          timezone: dto.timezone ?? "UTC",
          nextRunAt: scheduledAt,
        };
      }
    } else if (type === "RECURRING") {
      if (!dto.cronExpression || !isValidCronExpression(dto.cronExpression)) {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_CRON", "RECURRING jobs require a valid 5-field cron expression");
      }
      const timezone = dto.timezone ?? "UTC";
      if (!isValidIanaTimezone(timezone)) {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_TIMEZONE", "timezone must be a valid IANA name (e.g. UTC, America/New_York)");
      }
      scheduledAt = getNextCronRun(dto.cronExpression, { timezone });
      status = "SCHEDULED";
      schedule = {
        scheduleType: "CRON",
        cronExpression: dto.cronExpression,
        timezone,
        nextRunAt: scheduledAt,
      };
    }

    const retryPolicyId = dto.retryPolicyId ?? queue.retryPolicyId;
    const policy = await this.prisma.retryPolicy.findUnique({ where: { id: retryPolicyId } });
    if (!policy) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "RETRY_POLICY_NOT_FOUND", "Retry policy not found");
    }
    if (policy.organizationId !== queue.project.organizationId) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "RETRY_POLICY_ORG_MISMATCH", "Retry policy must belong to the queue's organization");
    }

    return {
      name: dto.name.trim(),
      type,
      taskType: dto.taskType,
      payload: dto.payload,
      status,
      priority: dto.priority ?? queue.defaultPriority,
      maxAttempts: dto.maxAttempts ?? policy.maxAttempts,
      retryPolicyId,
      idempotencyKey: idempotencyKey ?? dto.idempotencyKey ?? null,
      scheduledAt,
      timeoutMs: dto.timeoutMs ?? this.env.jobDefaultTimeoutMs,
      schedule,
    };
  }

  private async prepareBatchItem(
    item: CreateJobItemDto,
    queue: { defaultPriority: number; retryPolicyId: string; project: { organizationId: string } },
  ) {
    const retryPolicyId = item.retryPolicyId ?? queue.retryPolicyId;
    const policy = await this.prisma.retryPolicy.findUnique({ where: { id: retryPolicyId } });
    if (!policy || policy.organizationId !== queue.project.organizationId) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "RETRY_POLICY_NOT_FOUND", "Retry policy not found for batch item");
    }
    return {
      name: item.name.trim(),
      type: item.type ?? "BATCH",
      taskType: item.taskType,
      payload: item.payload,
      priority: item.priority ?? queue.defaultPriority,
      maxAttempts: item.maxAttempts ?? policy.maxAttempts,
      retryPolicyId,
      idempotencyKey: item.idempotencyKey ?? null,
      timeoutMs: item.timeoutMs ?? this.env.jobDefaultTimeoutMs,
    };
  }

  private async visibleQueueIds(userId: string, query: ListJobsQueryDto): Promise<string[]> {
    if (query.queueId) {
      await this.rbac.assertQueueAccess(userId, query.queueId, "VIEWER");
      return [query.queueId];
    }
    if (query.projectId) {
      await this.rbac.assertProjectAccess(userId, query.projectId, "VIEWER");
      const queues = await this.prisma.queue.findMany({
        where: { projectId: query.projectId },
        select: { id: true },
      });
      return queues.map((q) => q.id);
    }
    if (query.organizationId) {
      await this.rbac.assertMembership(userId, query.organizationId, "VIEWER");
      const queues = await this.prisma.queue.findMany({
        where: { project: { organizationId: query.organizationId } },
        select: { id: true },
      });
      return queues.map((q) => q.id);
    }
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    const orgIds = memberships.map((m) => m.organizationId);
    if (orgIds.length === 0) {
      return [];
    }
    const queues = await this.prisma.queue.findMany({
      where: { project: { organizationId: { in: orgIds } } },
      select: { id: true },
    });
    return queues.map((q) => q.id);
  }

  private toView(job: {
    id: string;
    projectId: string;
    queueId: string;
    batchId: string | null;
    createdByUserId: string | null;
    name: string;
    type: string;
    taskType: string;
    payload: unknown;
    status: string;
    priority: number;
    attempts: number;
    maxAttempts: number;
    retryPolicyId: string | null;
    idempotencyKey: string | null;
    scheduledAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    nextRetryAt: Date | null;
    lockedAt: Date | null;
    lockedBy: string | null;
    timeoutMs: number | null;
    schedule?: {
      scheduleType: string;
      cronExpression: string | null;
      timezone: string;
      nextRunAt: Date;
      active: boolean;
    } | null;
    queue?: { name: string; project?: { name: string; organizationId: string } };
  }) {
    return {
      id: job.id,
      projectId: job.projectId,
      queueId: job.queueId,
      batchId: job.batchId,
      createdByUserId: job.createdByUserId,
      name: job.name,
      type: job.type,
      taskType: job.taskType,
      payload: job.payload,
      status: job.status,
      priority: job.priority,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      retryPolicyId: job.retryPolicyId,
      idempotencyKey: job.idempotencyKey,
      scheduledAt: job.scheduledAt?.toISOString() ?? null,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      failedAt: job.failedAt?.toISOString() ?? null,
      nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
      lockedAt: job.lockedAt?.toISOString() ?? null,
      lockedBy: job.lockedBy,
      timeoutMs: job.timeoutMs,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      queueName: job.queue?.name,
      projectName: job.queue?.project?.name,
      organizationId: job.queue?.project?.organizationId,
      schedule: job.schedule
        ? {
            scheduleType: job.schedule.scheduleType,
            cronExpression: job.schedule.cronExpression,
            timezone: job.schedule.timezone,
            nextRunAt: job.schedule.nextRunAt.toISOString(),
            active: job.schedule.active,
          }
        : null,
    };
  }
}
