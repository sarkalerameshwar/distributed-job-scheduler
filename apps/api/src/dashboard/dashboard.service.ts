import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { RbacService } from "../auth/rbac.service";

const JOB_STATUSES = [
  "QUEUED",
  "SCHEDULED",
  "CLAIMED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "RETRYING",
  "CANCELLED",
  "DLQ",
] as const;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async overview(userId: string, organizationId: string) {
    await this.rbac.assertMembership(userId, organizationId, "VIEWER");

    const sinceHour = new Date(Date.now() - 60 * 60 * 1000);
    const sinceDay = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const projects = await this.prisma.project.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);

    const emptyCounts = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<
      (typeof JOB_STATUSES)[number],
      number
    >;

    if (projectIds.length === 0) {
      return {
        organizationId,
        jobCounts: emptyCounts,
        depth: 0,
        running: 0,
        completedLastHour: 0,
        failedLastHour: 0,
        openDlq: 0,
        workers: { total: 0, online: 0, draining: 0, failed: 0, offline: 0, starting: 0 },
        queues: [],
        throughputSeries: this.emptySeries(sinceDay),
        recentFailures: [],
        openDlqEntries: [],
      };
    }

    const [grouped, completedLastHour, failedLastHour, openDlq, workerGroups, queues, completedJobs, recentFailures, openDlqEntries] =
      await Promise.all([
        this.prisma.job.groupBy({
          by: ["status"],
          where: { projectId: { in: projectIds } },
          _count: { _all: true },
        }),
        this.prisma.jobExecution.count({
          where: {
            status: "COMPLETED",
            completedAt: { gte: sinceHour },
            job: { projectId: { in: projectIds } },
          },
        }),
        this.prisma.job.count({
          where: {
            projectId: { in: projectIds },
            status: { in: ["FAILED", "DLQ"] },
            failedAt: { gte: sinceHour },
          },
        }),
        this.prisma.deadLetterJob.count({
          where: {
            resolvedAt: null,
            job: { projectId: { in: projectIds } },
          },
        }),
        this.prisma.worker.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        this.prisma.queue.findMany({
          where: { projectId: { in: projectIds } },
          include: { project: { select: { name: true } } },
          orderBy: { updatedAt: "desc" },
          take: 12,
        }),
        this.prisma.jobExecution.findMany({
          where: {
            status: "COMPLETED",
            completedAt: { gte: sinceDay },
            job: { projectId: { in: projectIds } },
          },
          select: { completedAt: true },
        }),
        this.prisma.job.findMany({
          where: {
            projectId: { in: projectIds },
            status: { in: ["FAILED", "DLQ", "RETRYING"] },
          },
          include: { queue: { select: { name: true } } },
          orderBy: [{ failedAt: "desc" }, { updatedAt: "desc" }],
          take: 8,
        }),
        this.prisma.deadLetterJob.findMany({
          where: {
            resolvedAt: null,
            job: { projectId: { in: projectIds } },
          },
          include: {
            job: {
              select: {
                id: true,
                name: true,
                status: true,
                taskType: true,
                queue: { select: { name: true } },
              },
            },
          },
          orderBy: { movedAt: "desc" },
          take: 5,
        }),
      ]);

    const jobCounts = { ...emptyCounts };
    for (const row of grouped) {
      jobCounts[row.status] = row._count._all;
    }

    const workers = {
      total: 0,
      online: 0,
      draining: 0,
      failed: 0,
      offline: 0,
      starting: 0,
    };
    for (const row of workerGroups) {
      workers.total += row._count._all;
      if (row.status === "ONLINE") workers.online = row._count._all;
      else if (row.status === "DRAINING") workers.draining = row._count._all;
      else if (row.status === "FAILED") workers.failed = row._count._all;
      else if (row.status === "OFFLINE") workers.offline = row._count._all;
      else if (row.status === "STARTING") workers.starting = row._count._all;
    }

    const queueStats = await Promise.all(
      queues.map(async (queue) => {
        const byStatus = await this.prisma.job.groupBy({
          by: ["status"],
          where: { queueId: queue.id },
          _count: { _all: true },
        });
        const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
        const depth =
          (counts.QUEUED ?? 0) + (counts.SCHEDULED ?? 0) + (counts.RETRYING ?? 0);
        const running = (counts.RUNNING ?? 0) + (counts.CLAIMED ?? 0);
        const throughputLastHour = await this.prisma.jobExecution.count({
          where: {
            status: "COMPLETED",
            completedAt: { gte: sinceHour },
            job: { queueId: queue.id },
          },
        });
        return {
          id: queue.id,
          name: queue.name,
          projectName: queue.project.name,
          status: queue.status,
          maxConcurrency: queue.maxConcurrency,
          depth,
          running,
          dlq: counts.DLQ ?? 0,
          throughputLastHour,
        };
      }),
    );

    const bucketMap = new Map<string, number>();
    for (const row of completedJobs) {
      if (!row.completedAt) continue;
      const key = this.hourKey(row.completedAt);
      bucketMap.set(key, (bucketMap.get(key) ?? 0) + 1);
    }

    return {
      organizationId,
      jobCounts,
      depth: jobCounts.QUEUED + jobCounts.SCHEDULED + jobCounts.RETRYING,
      running: jobCounts.RUNNING + jobCounts.CLAIMED,
      completedLastHour,
      failedLastHour,
      openDlq,
      workers,
      queues: queueStats,
      throughputSeries: this.fillSeries(sinceDay, bucketMap),
      recentFailures: recentFailures.map((job) => ({
        id: job.id,
        name: job.name,
        status: job.status,
        taskType: job.taskType,
        queueName: job.queue.name,
        failedAt: job.failedAt?.toISOString() ?? job.updatedAt.toISOString(),
      })),
      openDlqEntries: openDlqEntries.map((row) => ({
        id: row.id,
        jobId: row.job.id,
        jobName: row.job.name,
        queueName: row.job.queue.name,
        reason: row.reason,
        attempts: row.attempts,
        movedAt: row.movedAt.toISOString(),
      })),
    };
  }

  private emptySeries(since: Date) {
    return this.fillSeries(since, new Map());
  }

  private fillSeries(since: Date, bucketMap: Map<string, number>) {
    const series: Array<{ hour: string; completed: number }> = [];
    const startMs = this.hourKeyDate(since).getTime();
    const endMs = this.hourKeyDate(new Date()).getTime();
    for (let t = startMs; t <= endMs; t += 60 * 60 * 1000) {
      const hour = new Date(t).toISOString();
      series.push({ hour, completed: bucketMap.get(hour) ?? 0 });
    }
    return series;
  }

  private hourKey(d: Date): string {
    return this.hourKeyDate(d).toISOString();
  }

  private hourKeyDate(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), 0, 0, 0));
  }
}
