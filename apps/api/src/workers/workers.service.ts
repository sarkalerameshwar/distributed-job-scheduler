import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma, WorkerStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { paginatedResult, toSkipTake } from "../common/pagination";
import { AppError } from "../common/errors/app-error";
import type { ListWorkersQueryDto } from "./dto/workers.dto";

@Injectable()
export class WorkersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListWorkersQueryDto) {
    const where: Prisma.WorkerWhereInput = {
      ...(query.status ? { status: query.status as WorkerStatus } : {}),
    };
    const total = await this.prisma.worker.count({ where });
    const rows = await this.prisma.worker.findMany({
      where,
      orderBy: [{ lastHeartbeatAt: "desc" }, { startedAt: "desc" }],
      ...toSkipTake(query.page ?? 1, query.limit ?? 20),
    });

    const workerIds = rows.map((r) => r.workerId);
    const inFlight =
      workerIds.length === 0
        ? []
        : await this.prisma.job.findMany({
            where: {
              lockedBy: { in: workerIds },
              status: { in: ["CLAIMED", "RUNNING"] },
            },
            select: {
              id: true,
              name: true,
              status: true,
              taskType: true,
              lockedBy: true,
              queue: { select: { name: true } },
            },
            orderBy: { lockedAt: "asc" },
            take: 200,
          });

    const byWorker = new Map<string, typeof inFlight>();
    for (const job of inFlight) {
      if (!job.lockedBy) continue;
      const list = byWorker.get(job.lockedBy) ?? [];
      list.push(job);
      byWorker.set(job.lockedBy, list);
    }

    return paginatedResult(
      rows.map((row) =>
        this.toView(row, (byWorker.get(row.workerId) ?? []).map((j) => this.toInFlight(j))),
      ),
      total,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  async get(id: string) {
    const row = await this.prisma.worker.findFirst({
      where: { OR: [{ id }, { workerId: id }] },
    });
    if (!row) {
      throw new AppError(HttpStatus.NOT_FOUND, "WORKER_NOT_FOUND", "Worker not found");
    }

    const recentHeartbeats = await this.prisma.workerHeartbeat.findMany({
      where: { workerId: row.id },
      orderBy: { heartbeatAt: "desc" },
      take: 20,
      select: {
        id: true,
        heartbeatAt: true,
        currentJobCount: true,
        memoryUsage: true,
      },
    });

    const inFlight = await this.prisma.job.findMany({
      where: {
        lockedBy: row.workerId,
        status: { in: ["CLAIMED", "RUNNING"] },
      },
      select: {
        id: true,
        name: true,
        status: true,
        taskType: true,
        lockedBy: true,
        queue: { select: { name: true } },
      },
      orderBy: { lockedAt: "asc" },
    });

    return {
      ...this.toView(
        row,
        inFlight.map((j) => this.toInFlight(j)),
      ),
      inFlightJobs: inFlight.length,
      recentHeartbeats: recentHeartbeats.map((h) => ({
        id: h.id,
        heartbeatAt: h.heartbeatAt.toISOString(),
        currentJobCount: h.currentJobCount,
        memoryUsage: h.memoryUsage !== null && h.memoryUsage !== undefined ? Number(h.memoryUsage) : null,
      })),
    };
  }

  private toInFlight(job: {
    id: string;
    name: string;
    status: string;
    taskType: string;
    queue: { name: string };
  }) {
    return {
      id: job.id,
      name: job.name,
      status: job.status,
      taskType: job.taskType,
      queueName: job.queue.name,
    };
  }

  private toView(
    row: {
      id: string;
      workerId: string;
      hostname: string;
      processId: number;
      version: string;
      status: string;
      concurrency: number;
      currentJobCount: number;
      lastHeartbeatAt: Date | null;
      startedAt: Date;
      stoppedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
    activeJobs: Array<{
      id: string;
      name: string;
      status: string;
      taskType: string;
      queueName: string;
    }> = [],
  ) {
    return {
      id: row.id,
      workerId: row.workerId,
      hostname: row.hostname,
      processId: row.processId,
      version: row.version,
      status: row.status,
      concurrency: row.concurrency,
      currentJobCount: row.currentJobCount,
      lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
      startedAt: row.startedAt.toISOString(),
      stoppedAt: row.stoppedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      activeJobs,
    };
  }
}
