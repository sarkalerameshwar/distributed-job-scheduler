import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { RbacService } from "../auth/rbac.service";
import { AppError } from "../common/errors/app-error";
import { paginatedResult, toSkipTake } from "../common/pagination";
import { JobsService } from "../jobs/jobs.service";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import type { ListDlqQueryDto } from "./dto/dlq.dto";

@Injectable()
export class DlqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly jobs: JobsService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async list(userId: string, query: ListDlqQueryDto) {
    await this.rbac.assertMembership(userId, query.organizationId, "VIEWER");

    const where: Prisma.DeadLetterJobWhereInput = {
      ...(query.resolved === true
        ? { resolvedAt: { not: null } }
        : query.resolved === false
          ? { resolvedAt: null }
          : {}),
      job: {
        ...(query.queueId ? { queueId: query.queueId } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        project: { organizationId: query.organizationId },
      },
    };

    const total = await this.prisma.deadLetterJob.count({ where });
    const rows = await this.prisma.deadLetterJob.findMany({
      where,
      include: {
        job: {
          include: {
            queue: true,
            project: true,
          },
        },
        finalExecution: {
          select: {
            id: true,
            status: true,
            errorCode: true,
            errorMessage: true,
            durationMs: true,
            completedAt: true,
            attemptNumber: true,
          },
        },
      },
      orderBy: { movedAt: "desc" },
      ...toSkipTake(query.page ?? 1, query.limit ?? 20),
    });

    return paginatedResult(
      rows.map((row) => this.toSummary(row)),
      total,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  async get(userId: string, id: string) {
    const row = await this.load(id);
    await this.rbac.assertMembership(userId, row.job.project.organizationId, "VIEWER");
    return this.toDetail(row);
  }

  async retry(userId: string, id: string) {
    const row = await this.load(id);
    await this.rbac.assertMembership(userId, row.job.project.organizationId, "MEMBER");
    if (row.resolvedAt) {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "DLQ_ALREADY_RESOLVED",
        "Dead-letter entry is already resolved",
        { resolution: row.resolution },
      );
    }
    if (row.job.status !== "DLQ") {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "JOB_NOT_IN_DLQ",
        "Linked job is not in DLQ status",
        { status: row.job.status },
      );
    }
    const job = await this.jobs.retry(userId, row.jobId);
    const refreshed = await this.load(id);
    void this.realtime.dlqUpdated(row.job.project.organizationId, {
      dlqId: id,
      jobId: row.jobId,
      resolution: "RETRIED",
    });
    return { deadLetter: this.toSummary(refreshed), job };
  }

  async discard(userId: string, id: string, note?: string) {
    return this.markResolved(userId, id, "DISCARDED", note ?? "Discarded by operator");
  }

  async resolve(userId: string, id: string, note?: string) {
    return this.markResolved(userId, id, "RESOLVED", note ?? "Marked resolved by operator");
  }

  private async markResolved(
    userId: string,
    id: string,
    resolution: "DISCARDED" | "RESOLVED",
    note: string,
  ) {
    const row = await this.load(id);
    await this.rbac.assertMembership(userId, row.job.project.organizationId, "MEMBER");
    if (row.resolvedAt) {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "DLQ_ALREADY_RESOLVED",
        "Dead-letter entry is already resolved",
        { resolution: row.resolution },
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.deadLetterJob.update({
        where: { id },
        data: { resolution, resolvedAt: new Date() },
        include: {
          job: { include: { queue: true, project: true } },
          finalExecution: {
            select: {
              id: true,
              status: true,
              errorCode: true,
              errorMessage: true,
              durationMs: true,
              completedAt: true,
              attemptNumber: true,
            },
          },
        },
      });
      await tx.jobLog.create({
        data: {
          jobId: row.jobId,
          level: "WARN",
          message: note.slice(0, 2048),
          metadata: { resolution, dlqId: id },
        },
      });
      return next;
    });

    void this.realtime.dlqUpdated(row.job.project.organizationId, {
      dlqId: id,
      jobId: row.jobId,
      resolution,
    });
    return this.toSummary(updated);
  }

  private async load(id: string) {
    const row = await this.prisma.deadLetterJob.findUnique({
      where: { id },
      include: {
        job: {
          include: {
            queue: true,
            project: true,
          },
        },
        finalExecution: {
          select: {
            id: true,
            status: true,
            errorCode: true,
            errorMessage: true,
            errorStack: true,
            durationMs: true,
            completedAt: true,
            attemptNumber: true,
            result: true,
          },
        },
      },
    });
    if (!row) {
      throw new AppError(HttpStatus.NOT_FOUND, "DLQ_NOT_FOUND", "Dead-letter entry not found");
    }
    return row;
  }

  private toSummary(row: {
    id: string;
    jobId: string;
    finalExecutionId: string | null;
    reason: string;
    finalError: string | null;
    attempts: number;
    movedAt: Date;
    resolvedAt: Date | null;
    resolution: string | null;
    createdAt: Date;
    updatedAt: Date;
    job: {
      id: string;
      name: string;
      type: string;
      status: string;
      taskType: string;
      queueId: string;
      projectId: string;
      queue: { name: string };
      project: { name: string; organizationId: string };
    };
    finalExecution: {
      id: string;
      status: string;
      errorCode: string | null;
      errorMessage: string | null;
      durationMs: number | null;
      completedAt: Date | null;
      attemptNumber: number;
    } | null;
  }) {
    return {
      id: row.id,
      jobId: row.jobId,
      finalExecutionId: row.finalExecutionId,
      reason: row.reason,
      finalError: row.finalError,
      attempts: row.attempts,
      movedAt: row.movedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolution: row.resolution,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      job: {
        id: row.job.id,
        name: row.job.name,
        type: row.job.type,
        status: row.job.status,
        taskType: row.job.taskType,
        queueId: row.job.queueId,
        queueName: row.job.queue.name,
        projectId: row.job.projectId,
        projectName: row.job.project.name,
        organizationId: row.job.project.organizationId,
      },
      finalExecution: row.finalExecution
        ? {
            id: row.finalExecution.id,
            status: row.finalExecution.status,
            errorCode: row.finalExecution.errorCode,
            errorMessage: row.finalExecution.errorMessage,
            durationMs: row.finalExecution.durationMs,
            completedAt: row.finalExecution.completedAt?.toISOString() ?? null,
            attemptNumber: row.finalExecution.attemptNumber,
          }
        : null,
    };
  }

  private toDetail(
    row: Awaited<ReturnType<DlqService["load"]>>,
  ) {
    return {
      ...this.toSummary(row),
      finalExecution: row.finalExecution
        ? {
            id: row.finalExecution.id,
            status: row.finalExecution.status,
            errorCode: row.finalExecution.errorCode,
            errorMessage: row.finalExecution.errorMessage,
            errorStack: row.finalExecution.errorStack,
            durationMs: row.finalExecution.durationMs,
            completedAt: row.finalExecution.completedAt?.toISOString() ?? null,
            attemptNumber: row.finalExecution.attemptNumber,
            result: row.finalExecution.result,
          }
        : null,
    };
  }
}
