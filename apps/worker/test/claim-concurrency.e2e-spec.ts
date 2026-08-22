import { PrismaClient } from "@prisma/client";
import { JobClaimService } from "../src/job-claim.service";
import { PrismaService } from "../src/prisma.service";
import { WorkerContext } from "../src/worker-context";

/**
 * Integration tests against the real MySQL database (Phase 7).
 * Requires DATABASE_URL (same as local/dev).
 */
describe("Atomic claim concurrency (e2e)", () => {
  const prisma = new PrismaClient();
  const suffix = `p7_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let organizationId: string;
  let projectId: string;
  let queueId: string;
  let retryPolicyId: string;
  const workerDbIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();

    const org = await prisma.organization.create({
      data: {
        name: `Concurrency Org ${suffix}`,
        slug: `conc-org-${suffix}`,
      },
    });
    organizationId = org.id;

    const policy = await prisma.retryPolicy.create({
      data: {
        organizationId,
        name: `fixed-${suffix}`,
        strategy: "FIXED",
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        multiplier: 1,
      },
    });
    retryPolicyId = policy.id;

    const project = await prisma.project.create({
      data: {
        organizationId,
        name: "Concurrency Project",
        slug: `conc-proj-${suffix}`,
      },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    // Children first (FKs are Restrict on most history tables).
    await prisma.jobLog.deleteMany({ where: { job: { projectId } } });
    await prisma.jobExecution.deleteMany({ where: { job: { projectId } } });
    await prisma.deadLetterJob.deleteMany({ where: { job: { projectId } } });
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

  async function createQueue(maxConcurrency: number): Promise<string> {
    const queue = await prisma.queue.create({
      data: {
        projectId,
        name: `q-${maxConcurrency}-${Date.now()}`,
        status: "ACTIVE",
        maxConcurrency,
        defaultPriority: 0,
        retryPolicyId,
      },
    });
    queueId = queue.id;
    return queue.id;
  }

  async function createQueuedJobs(qid: string, count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const job = await prisma.job.create({
        data: {
          projectId,
          queueId: qid,
          name: `job-${i}`,
          type: "IMMEDIATE",
          taskType: "test_success",
          payload: { i },
          status: "QUEUED",
          priority: count - i,
          attempts: 0,
          maxAttempts: 3,
          retryPolicyId,
          timeoutMs: 30_000,
        },
      });
      ids.push(job.id);
    }
    return ids;
  }

  function makeClaimService(workerPublicId: string, dbId: string): JobClaimService {
    const ctx = {
      dbId,
      draining: false,
      activeJobIds: new Set<string>(),
      identity: {
        workerId: workerPublicId,
        hostname: "test-host",
        processId: process.pid,
        version: "test",
      },
      get currentJobCount() {
        return this.activeJobIds.size;
      },
    } as WorkerContext;

    return new JobClaimService(prisma as unknown as PrismaService, ctx, {
      jobUpdated: async () => undefined,
    } as never, {
      incClaim: () => undefined,
    } as never);
  }

  async function registerWorker(label: string): Promise<{ service: JobClaimService; dbId: string }> {
    const workerId = `worker-${suffix}-${label}`;
    const worker = await prisma.worker.create({
      data: {
        workerId,
        hostname: "test-host",
        processId: process.pid,
        version: "test",
        status: "ONLINE",
        concurrency: 10,
        currentJobCount: 0,
        lastHeartbeatAt: new Date(),
      },
    });
    workerDbIds.push(worker.id);
    return { service: makeClaimService(workerId, worker.id), dbId: worker.id };
  }

  it("allows only one worker to claim the same job under parallel contention", async () => {
    const qid = await createQueue(8);
    const [jobId] = await createQueuedJobs(qid, 1);

    const claimers = await Promise.all(
      Array.from({ length: 12 }, (_, i) => registerWorker(`single-${i}`)),
    );

    const results = await Promise.all(claimers.map((c) => c.service.claimNext({ queueId: qid })));
    const winners = results.filter((r): r is NonNullable<typeof r> => r !== null);

    expect(winners).toHaveLength(1);
    expect(winners[0]!.id).toBe(jobId);

    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("CLAIMED");
    expect(job.attempts).toBe(1);

    const executions = await prisma.jobExecution.findMany({ where: { jobId } });
    expect(executions).toHaveLength(1);
  });

  it("never exceeds maxConcurrency=1 across parallel claimers", async () => {
    const qid = await createQueue(1);
    await createQueuedJobs(qid, 5);

    const claimers = await Promise.all(
      Array.from({ length: 10 }, (_, i) => registerWorker(`cap1-${i}`)),
    );

    const results = await Promise.all(claimers.map((c) => c.service.claimNext({ queueId: qid })));
    const winners = results.filter((r) => r !== null);

    expect(winners.length).toBe(1);

    const inFlight = await prisma.job.count({
      where: { queueId: qid, status: { in: ["CLAIMED", "RUNNING"] } },
    });
    expect(inFlight).toBe(1);
  });

  it("allows up to maxConcurrency=2 in-flight and no more", async () => {
    const qid = await createQueue(2);
    await createQueuedJobs(qid, 6);

    const claimers = await Promise.all(
      Array.from({ length: 12 }, (_, i) => registerWorker(`cap2-${i}`)),
    );

    const results = await Promise.all(claimers.map((c) => c.service.claimNext({ queueId: qid })));
    const winners = results.filter((r) => r !== null);

    expect(winners.length).toBe(2);

    const inFlight = await prisma.job.count({
      where: { queueId: qid, status: { in: ["CLAIMED", "RUNNING"] } },
    });
    expect(inFlight).toBe(2);

    const uniqueJobIds = new Set(winners.map((w) => w!.id));
    expect(uniqueJobIds.size).toBe(2);
  });
});
