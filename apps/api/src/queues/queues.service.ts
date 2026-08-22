import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { RbacService } from "../auth/rbac.service";
import { AppError } from "../common/errors/app-error";
import { paginatedResult, toSkipTake } from "../common/pagination";
import { rethrowUnique } from "../common/prisma-errors";
import type { CreateQueueDto, ListQueuesQueryDto, UpdateQueueDto } from "./dto/queue.dto";
import { RealtimePublisher } from "../realtime/realtime.publisher";

const STATUSES = ["QUEUED", "SCHEDULED", "CLAIMED", "RUNNING", "COMPLETED", "FAILED", "RETRYING", "CANCELLED", "DLQ"] as const;

@Injectable()
export class QueuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async create(userId: string, dto: CreateQueueDto) {
    const { project } = await this.rbac.assertProjectAccess(userId, dto.projectId, "ADMIN");
    await this.assertPolicyInOrg(dto.retryPolicyId, project.organizationId);
    try {
      const queue = await this.prisma.queue.create({
        data: {
          projectId: dto.projectId,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          maxConcurrency: dto.maxConcurrency ?? 5,
          defaultPriority: dto.defaultPriority ?? 0,
          retryPolicyId: dto.retryPolicyId,
        },
        include: { retryPolicy: true, project: true },
      });
      return this.toView(queue);
    } catch (error) {
      rethrowUnique(error, "QUEUE_NAME_TAKEN", "A queue with this name already exists in the project");
    }
  }

  async list(userId: string, query: ListQueuesQueryDto) {
    const projectIds = await this.visibleProjectIds(userId, query);
    if (projectIds.length === 0) {
      return paginatedResult([], 0, query.page, query.limit);
    }
    const where: Prisma.QueueWhereInput = {
      projectId: { in: projectIds },
      status: query.status,
    };
    const total = await this.prisma.queue.count({ where });
    const queues = await this.prisma.queue.findMany({
      where,
      include: { retryPolicy: true, project: true, _count: { select: { jobs: true } } },
      orderBy: { createdAt: "desc" },
      ...toSkipTake(query.page, query.limit),
    });
    return paginatedResult(
      queues.map((q) => ({ ...this.toView(q), jobCount: q._count.jobs })),
      total,
      query.page,
      query.limit,
    );
  }

  async get(userId: string, id: string) {
    const { queue } = await this.rbac.assertQueueAccess(userId, id, "VIEWER");
    return this.toView(queue);
  }

  async update(userId: string, id: string, dto: UpdateQueueDto) {
    const { queue } = await this.rbac.assertQueueAccess(userId, id, "ADMIN");
    if (dto.retryPolicyId) {
      await this.assertPolicyInOrg(dto.retryPolicyId, queue.project.organizationId);
    }
    const updated = await this.prisma.queue.update({
      where: { id },
      data: {
        description: dto.description,
        maxConcurrency: dto.maxConcurrency,
        defaultPriority: dto.defaultPriority,
        retryPolicyId: dto.retryPolicyId,
      },
      include: { retryPolicy: true, project: true },
    });
    return this.toView(updated);
  }

  async pause(userId: string, id: string) {
    const { queue } = await this.rbac.assertQueueAccess(userId, id, "ADMIN");
    if (queue.status === "DISABLED") {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "QUEUE_DISABLED", "A disabled queue cannot be paused");
    }
    const updated = await this.prisma.queue.update({
      where: { id },
      data: { status: "PAUSED", pausedAt: new Date() },
      include: { retryPolicy: true, project: true },
    });
    void this.realtime.queueUpdated(updated.project.organizationId, {
      queueId: updated.id,
      status: updated.status,
    });
    return this.toView(updated);
  }

  async resume(userId: string, id: string) {
    const { queue } = await this.rbac.assertQueueAccess(userId, id, "ADMIN");
    if (queue.status === "DISABLED") {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "QUEUE_DISABLED", "A disabled queue cannot be resumed");
    }
    const updated = await this.prisma.queue.update({
      where: { id },
      data: { status: "ACTIVE", pausedAt: null },
      include: { retryPolicy: true, project: true },
    });
    void this.realtime.queueUpdated(updated.project.organizationId, {
      queueId: updated.id,
      status: updated.status,
    });
    return this.toView(updated);
  }

  async archive(userId: string, id: string) {
    await this.rbac.assertQueueAccess(userId, id, "ADMIN");
    const updated = await this.prisma.queue.update({
      where: { id },
      data: { status: "DISABLED", pausedAt: new Date() },
      include: { retryPolicy: true, project: true },
    });
    void this.realtime.queueUpdated(updated.project.organizationId, {
      queueId: updated.id,
      status: updated.status,
    });
    return this.toView(updated);
  }

  async stats(userId: string, id: string) {
    await this.rbac.assertQueueAccess(userId, id, "VIEWER");
    const grouped = await this.prisma.job.groupBy({
      by: ["status"],
      where: { queueId: id },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<(typeof STATUSES)[number], number>;
    for (const row of grouped) {
      counts[row.status] = row._count._all;
    }

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const completedLastHour = await this.prisma.job.count({
      where: { queueId: id, status: "COMPLETED", completedAt: { gte: since } },
    });

    const duration = await this.prisma.jobExecution.aggregate({
      where: { status: "COMPLETED", job: { queueId: id }, durationMs: { not: null } },
      _avg: { durationMs: true },
    });

    return {
      queueId: id,
      counts,
      depth: counts.QUEUED + counts.SCHEDULED + counts.RETRYING,
      running: counts.RUNNING + counts.CLAIMED,
      throughputLastHour: completedLastHour,
      averageExecutionDurationMs: duration._avg.durationMs ? Math.round(duration._avg.durationMs) : null,
    };
  }

  private async assertPolicyInOrg(retryPolicyId: string, organizationId: string): Promise<void> {
    const policy = await this.prisma.retryPolicy.findUnique({ where: { id: retryPolicyId } });
    if (!policy || policy.organizationId !== organizationId) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "RETRY_POLICY_INVALID", "Retry policy does not belong to this organization");
    }
  }

  private async visibleProjectIds(userId: string, query: ListQueuesQueryDto): Promise<string[]> {
    if (query.projectId) {
      await this.rbac.assertProjectAccess(userId, query.projectId, "VIEWER");
      return [query.projectId];
    }
    if (query.organizationId) {
      await this.rbac.assertMembership(userId, query.organizationId, "VIEWER");
      const projects = await this.prisma.project.findMany({
        where: { organizationId: query.organizationId },
        select: { id: true },
      });
      return projects.map((p) => p.id);
    }
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    const orgIds = memberships.map((m) => m.organizationId);
    if (orgIds.length === 0) {
      return [];
    }
    const projects = await this.prisma.project.findMany({
      where: { organizationId: { in: orgIds } },
      select: { id: true },
    });
    return projects.map((p) => p.id);
  }

  private toView(queue: {
    id: string;
    projectId: string;
    name: string;
    description: string | null;
    status: string;
    maxConcurrency: number;
    defaultPriority: number;
    retryPolicyId: string;
    pausedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    retryPolicy?: { name: string; strategy: string; maxAttempts: number };
    project?: { name: string; organizationId: string };
  }) {
    return {
      id: queue.id,
      projectId: queue.projectId,
      organizationId: queue.project?.organizationId,
      projectName: queue.project?.name,
      name: queue.name,
      description: queue.description,
      status: queue.status,
      maxConcurrency: queue.maxConcurrency,
      defaultPriority: queue.defaultPriority,
      retryPolicyId: queue.retryPolicyId,
      retryPolicy: queue.retryPolicy
        ? {
            name: queue.retryPolicy.name,
            strategy: queue.retryPolicy.strategy,
            maxAttempts: queue.retryPolicy.maxAttempts,
          }
        : undefined,
      pausedAt: queue.pausedAt?.toISOString() ?? null,
      createdAt: queue.createdAt.toISOString(),
      updatedAt: queue.updatedAt.toISOString(),
    };
  }
}
