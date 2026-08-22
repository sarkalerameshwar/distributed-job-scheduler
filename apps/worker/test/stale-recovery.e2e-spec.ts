import { PrismaClient } from "@prisma/client";
import { calculateRetryDelay } from "@djs/shared-types";
import { StaleRecoveryService } from "../src/stale-recovery.service";
import { PrismaService } from "../src/prisma.service";
import { RetryService } from "../src/retry.service";
import type { EnvService } from "../src/config/env.service";

describe("Stale worker recovery (e2e)", () => {
  const prisma = new PrismaClient();
  const suffix = `p12_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let organizationId: string;
  let projectId: string;
  let queueId: string;
  let retryPolicyId: string;
  const workerDbIds: string[] = [];

  const env = {
    heartbeatTimeoutMs: 1_000,
    heartbeatRetentionDays: 7,
  } as EnvService;

  let recovery: StaleRecoveryService;

  beforeAll(async () => {
    await prisma.$connect();
    const realtime = {
      jobUpdated: async () => undefined,
      dlqUpdated: async () => undefined,
      workerUpdated: async () => undefined,
      publish: async () => undefined,
    } as unknown as import("../src/realtime.publisher").RealtimePublisher;
    const metrics = {
      incRecovery: () => undefined,
      incClaim: () => undefined,
      incCompletion: () => undefined,
      incFailure: () => undefined,
      incDlq: () => undefined,
      incHeartbeat: () => undefined,
      incRealtimePublish: () => undefined,
    } as unknown as import("../src/worker-metrics.service").WorkerMetricsService;
    recovery = new StaleRecoveryService(
      prisma as unknown as PrismaService,
      env,
      new RetryService(),
      realtime,
      metrics,
    );

    const org = await prisma.organization.create({
      data: { name: `Recovery Org ${suffix}`, slug: `rec-org-${suffix}` },
    });
    organizationId = org.id;

    const policy = await prisma.retryPolicy.create({
      data: {
        organizationId,
        name: `fixed-${suffix}`,
        strategy: "FIXED",
        maxAttempts: 3,
        initialDelayMs: 500,
        maxDelayMs: 5_000,
        multiplier: 1,
      },
    });
    retryPolicyId = policy.id;

    const project = await prisma.project.create({
      data: {
        organizationId,
        name: "Recovery Project",
        slug: `rec-proj-${suffix}`,
      },
    });
    projectId = project.id;

    const queue = await prisma.queue.create({
      data: {
        projectId,
        name: `recovery-q-${suffix}`,
        status: "ACTIVE",
        maxConcurrency: 4,
        defaultPriority: 0,
        retryPolicyId,
      },
    });
    queueId = queue.id;
  });

  afterAll(async () => {
    await prisma.jobLog.deleteMany({ where: { job: { projectId } } });
    await prisma.deadLetterJob.deleteMany({ where: { job: { projectId } } });
    await prisma.jobExecution.deleteMany({ where: { job: { projectId } } });
    await prisma.scheduledJob.deleteMany({ where: { job: { projectId } } });
    await prisma.job.updateMany({ where: { projectId }, data: { lockedBy: null } });
    await prisma.job.deleteMany({ where: { projectId } });
    await prisma.queue.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
    await prisma.retryPolicy.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    if (workerDbIds.length) {
      await prisma.workerHeartbeat.deleteMany({ where: { workerId: { in: workerDbIds } } });
      await prisma.worker.deleteMany({ where: { id: { in: workerDbIds } } });
    }
    await prisma.$disconnect();
  });

  it("marks stale workers FAILED and requeues orphaned RUNNING jobs", async () => {
    const publicWorkerId = `dead-worker-${suffix}`;
    const worker = await prisma.worker.create({
      data: {
        workerId: publicWorkerId,
        hostname: "test-host",
        processId: 42,
        version: "test",
        status: "ONLINE",
        concurrency: 2,
        currentJobCount: 1,
        lastHeartbeatAt: new Date(Date.now() - 60_000),
      },
    });
    workerDbIds.push(worker.id);

    const job = await prisma.job.create({
      data: {
        projectId,
        queueId,
        name: `stuck-${suffix}`,
        type: "IMMEDIATE",
        taskType: "test_success",
        payload: {},
        status: "RUNNING",
        priority: 0,
        attempts: 1,
        maxAttempts: 3,
        retryPolicyId,
        lockedAt: new Date(Date.now() - 60_000),
        lockedBy: publicWorkerId,
        startedAt: new Date(Date.now() - 60_000),
      },
    });

    const execution = await prisma.jobExecution.create({
      data: {
        jobId: job.id,
        workerId: worker.id,
        attemptNumber: 1,
        status: "RUNNING",
        startedAt: new Date(Date.now() - 60_000),
      },
    });

    const stats = await recovery.run();
    expect(stats.staleWorkers).toBeGreaterThanOrEqual(1);
    expect(stats.recoveredJobs).toBeGreaterThanOrEqual(1);

    const refreshedWorker = await prisma.worker.findUniqueOrThrow({ where: { id: worker.id } });
    expect(refreshedWorker.status).toBe("FAILED");

    const refreshedJob = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(refreshedJob.status).toBe("RETRYING");
    expect(refreshedJob.lockedBy).toBeNull();
    expect(refreshedJob.nextRetryAt).toBeTruthy();

    const refreshedExec = await prisma.jobExecution.findUniqueOrThrow({ where: { id: execution.id } });
    expect(refreshedExec.status).toBe("TIMEOUT");
    expect(refreshedExec.errorCode).toBe("WORKER_HEARTBEAT_TIMEOUT");

    const expectedDelay = calculateRetryDelay({
      strategy: "FIXED",
      attempt: 1,
      initialDelayMs: 500,
      maxDelayMs: 5_000,
      multiplier: 1,
    });
    expect(Math.abs((refreshedJob.nextRetryAt!.getTime() - Date.now()) - expectedDelay)).toBeLessThan(2_000);
  });

  it("moves exhausted recovered jobs to DLQ", async () => {
    const publicWorkerId = `dead-worker-dlq-${suffix}`;
    const worker = await prisma.worker.create({
      data: {
        workerId: publicWorkerId,
        hostname: "test-host",
        processId: 43,
        version: "test",
        status: "ONLINE",
        concurrency: 1,
        currentJobCount: 1,
        lastHeartbeatAt: new Date(Date.now() - 60_000),
      },
    });
    workerDbIds.push(worker.id);

    const job = await prisma.job.create({
      data: {
        projectId,
        queueId,
        name: `stuck-dlq-${suffix}`,
        type: "IMMEDIATE",
        taskType: "test_failure",
        payload: {},
        status: "CLAIMED",
        priority: 0,
        attempts: 3,
        maxAttempts: 3,
        retryPolicyId,
        lockedAt: new Date(Date.now() - 60_000),
        lockedBy: publicWorkerId,
      },
    });

    await prisma.jobExecution.create({
      data: {
        jobId: job.id,
        workerId: worker.id,
        attemptNumber: 3,
        status: "CLAIMED",
      },
    });

    await recovery.run();

    const refreshedJob = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(refreshedJob.status).toBe("DLQ");
    expect(refreshedJob.lockedBy).toBeNull();

    const dlq = await prisma.deadLetterJob.findUniqueOrThrow({ where: { jobId: job.id } });
    expect(dlq.reason).toBe("worker_heartbeat_timeout");
  });
});
