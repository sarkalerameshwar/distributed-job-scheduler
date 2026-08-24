import { HttpStatus, Injectable } from "@nestjs/common";
import { getNextCronRun, getNextCronRuns, isValidCronExpression, isValidIanaTimezone } from "@djs/shared-types";
import { PrismaService } from "../database/prisma.service";
import { RbacService } from "../auth/rbac.service";
import { AppError } from "../common/errors/app-error";
import { paginatedResult, toSkipTake } from "../common/pagination";
import type { ListSchedulesQueryDto, PreviewCronDto, UpdateScheduleDto } from "./dto/schedule.dto";
import { DispatchWakePublisher } from "../realtime/dispatch-wake.publisher";

@Injectable()
export class SchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly dispatchWake: DispatchWakePublisher,
  ) {}

  async list(userId: string, query: ListSchedulesQueryDto) {
    await this.rbac.assertMembership(userId, query.organizationId, "VIEWER");

    const where = {
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.scheduleType ? { scheduleType: query.scheduleType } : {}),
      job: {
        ...(query.queueId ? { queueId: query.queueId } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        project: { organizationId: query.organizationId },
      },
    };

    const total = await this.prisma.scheduledJob.count({ where });
    const rows = await this.prisma.scheduledJob.findMany({
      where,
      include: {
        job: {
          include: {
            queue: true,
            project: true,
          },
        },
      },
      orderBy: [{ nextRunAt: "asc" }],
      ...toSkipTake(query.page ?? 1, query.limit ?? 20),
    });

    return paginatedResult(
      rows.map((row) => this.toView(row)),
      total,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  async get(userId: string, id: string) {
    const row = await this.loadSchedule(id);
    await this.rbac.assertMembership(userId, row.job.project.organizationId, "VIEWER");
    return this.toView(row);
  }

  async pause(userId: string, id: string) {
    const row = await this.loadSchedule(id);
    await this.rbac.assertMembership(userId, row.job.project.organizationId, "MEMBER");
    const updated = await this.prisma.scheduledJob.update({
      where: { id },
      data: { active: false },
      include: { job: { include: { queue: true, project: true } } },
    });
    await this.prisma.jobLog.create({
      data: { jobId: row.jobId, level: "WARN", message: "Schedule paused" },
    });
    return this.toView(updated);
  }

  async resume(userId: string, id: string) {
    const row = await this.loadSchedule(id);
    await this.rbac.assertMembership(userId, row.job.project.organizationId, "MEMBER");

    let nextRunAt = row.nextRunAt;
    if (row.scheduleType === "CRON" && row.cronExpression) {
      nextRunAt = getNextCronRun(row.cronExpression, { timezone: row.timezone || "UTC" });
    } else if (nextRunAt.getTime() <= Date.now()) {
      // One-shot / delay already in the past → queue immediately.
      nextRunAt = new Date();
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const schedule = await tx.scheduledJob.update({
        where: { id },
        data: { active: true, nextRunAt },
        include: { job: { include: { queue: true, project: true } } },
      });

      const due = nextRunAt.getTime() <= Date.now();
      await tx.job.update({
        where: { id: row.jobId },
        data: {
          status: due ? "QUEUED" : "SCHEDULED",
          scheduledAt: due ? null : nextRunAt,
          attempts: 0,
          failedAt: null,
          completedAt: null,
          nextRetryAt: null,
          lockedAt: null,
          lockedBy: null,
        },
      });
      await tx.jobLog.create({
        data: {
          jobId: row.jobId,
          level: "INFO",
          message: due ? "Schedule resumed — job queued immediately" : "Schedule resumed",
          metadata: { nextRunAt: nextRunAt.toISOString() },
        },
      });
      return schedule;
    });

    if (nextRunAt.getTime() <= Date.now()) {
      void this.dispatchWake.wake({
        reason: "schedule.resume",
        queueId: row.job.queueId,
        jobId: row.jobId,
      });
    }
    return this.toView(updated);
  }

  async update(userId: string, id: string, dto: UpdateScheduleDto) {
    const row = await this.loadSchedule(id);
    await this.rbac.assertMembership(userId, row.job.project.organizationId, "ADMIN");

    if (row.scheduleType !== "CRON" && (dto.cronExpression || dto.timezone)) {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "NOT_CRON_SCHEDULE",
        "Only CRON schedules can change cronExpression/timezone",
      );
    }

    const cronExpression = dto.cronExpression ?? row.cronExpression;
    const timezone = dto.timezone ?? row.timezone;
    if (dto.cronExpression && !isValidCronExpression(dto.cronExpression)) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_CRON", "Invalid 5-field cron expression");
    }
    if (dto.timezone && !isValidIanaTimezone(dto.timezone)) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_TIMEZONE", "Invalid IANA timezone");
    }

    let nextRunAt = row.nextRunAt;
    if (row.scheduleType === "CRON" && cronExpression) {
      nextRunAt = getNextCronRun(cronExpression, { timezone: timezone || "UTC" });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const schedule = await tx.scheduledJob.update({
        where: { id },
        data: {
          cronExpression: dto.cronExpression ?? undefined,
          timezone: dto.timezone ?? undefined,
          active: dto.active ?? undefined,
          nextRunAt,
        },
        include: { job: { include: { queue: true, project: true } } },
      });

      if (schedule.active && schedule.scheduleType === "CRON") {
        await tx.job.update({
          where: { id: row.jobId },
          data: {
            status: "SCHEDULED",
            scheduledAt: nextRunAt,
          },
        });
      }

      await tx.jobLog.create({
        data: {
          jobId: row.jobId,
          level: "INFO",
          message: "Schedule updated",
          metadata: {
            cronExpression: schedule.cronExpression,
            timezone: schedule.timezone,
            nextRunAt: nextRunAt.toISOString(),
            active: schedule.active,
          },
        },
      });
      return schedule;
    });

    return this.toView(updated);
  }

  previewCron(dto: PreviewCronDto) {
    const timezone = dto.timezone ?? "UTC";
    if (!isValidCronExpression(dto.cronExpression)) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_CRON", "Invalid 5-field cron expression");
    }
    if (!isValidIanaTimezone(timezone)) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_TIMEZONE", "Invalid IANA timezone");
    }
    const from = dto.from ? new Date(dto.from) : new Date();
    if (Number.isNaN(from.getTime())) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_FROM", "from must be an ISO timestamp");
    }
    const runs = getNextCronRuns(dto.cronExpression, dto.count ?? 5, { from, timezone });
    return {
      cronExpression: dto.cronExpression,
      timezone,
      from: from.toISOString(),
      nextRuns: runs.map((d) => d.toISOString()),
    };
  }

  private async loadSchedule(id: string) {
    const row = await this.prisma.scheduledJob.findUnique({
      where: { id },
      include: { job: { include: { queue: true, project: true } } },
    });
    if (!row) {
      throw new AppError(HttpStatus.NOT_FOUND, "SCHEDULE_NOT_FOUND", "Schedule not found");
    }
    return row;
  }

  private toView(row: {
    id: string;
    jobId: string;
    scheduleType: string;
    cronExpression: string | null;
    timezone: string;
    nextRunAt: Date;
    lastRunAt: Date | null;
    active: boolean;
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
  }) {
    return {
      id: row.id,
      jobId: row.jobId,
      scheduleType: row.scheduleType,
      cronExpression: row.cronExpression,
      timezone: row.timezone,
      nextRunAt: row.nextRunAt.toISOString(),
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      active: row.active,
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
    };
  }
}
