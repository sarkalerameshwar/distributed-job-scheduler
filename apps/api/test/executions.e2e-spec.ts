import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { requestIdMiddleware } from "../src/common/request-id.middleware";
import { EnvService } from "../src/config/env.service";

/**
 * Phase 8 — execution tracking is the audit trail.
 * Job.status is a cache; JobExecution + JobLog are authoritative for attempts.
 */
describe("Execution tracking (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const suffix = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware);
    app.setGlobalPrefix("api/v1", { exclude: ["health", "health/live", "health/ready", "metrics"] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter(app.get(EnvService)));
    await app.init();
    await prisma.$connect();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("exposes attempt history with results, errors, and filtered logs", async () => {
    const email = `exec.${suffix}@example.com`;
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "Phase8Test!99", name: "Exec User" })
      .expect(201);
    const token = registered.body.data.tokens.accessToken as string;

    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `Exec Org ${suffix}`, slug: `exec-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.data.id as string;

    const policies = await request(app.getHttpServer())
      .get(`/api/v1/retry-policies?organizationId=${organizationId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const retryPolicyId = policies.body.data[0].id as string;

    const project = await request(app.getHttpServer())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ organizationId, name: "Exec Project", slug: `exec-proj-${suffix}` })
      .expect(201);

    const queue = await request(app.getHttpServer())
      .post("/api/v1/queues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId: project.body.data.id,
        name: "tracked",
        retryPolicyId,
        maxConcurrency: 2,
      })
      .expect(201);
    const queueId = queue.body.data.id as string;

    const created = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        queueId,
        name: "Tracked job",
        type: "IMMEDIATE",
        taskType: "test_success",
        payload: { n: 1 },
      })
      .expect(201);
    const jobId = created.body.data.job.id as string;

    const worker = await prisma.worker.create({
      data: {
        workerId: `exec-test-worker-${suffix}`,
        hostname: "test",
        processId: 1,
        version: "test",
        status: "ONLINE",
        concurrency: 1,
        currentJobCount: 0,
        lastHeartbeatAt: new Date(),
      },
    });

    const failed = await prisma.jobExecution.create({
      data: {
        jobId,
        workerId: worker.id,
        attemptNumber: 1,
        status: "FAILED",
        startedAt: new Date(Date.now() - 50),
        completedAt: new Date(Date.now() - 20),
        durationMs: 30,
        errorCode: "TASK_FAILED",
        errorMessage: "simulated failure",
        errorStack: "Error: simulated failure\n    at test",
      },
    });
    await prisma.jobLog.create({
      data: {
        jobId,
        executionId: failed.id,
        workerId: worker.id,
        level: "ERROR",
        message: "simulated failure",
        metadata: { errorCode: "TASK_FAILED" },
      },
    });

    const completed = await prisma.jobExecution.create({
      data: {
        jobId,
        workerId: worker.id,
        attemptNumber: 2,
        status: "COMPLETED",
        startedAt: new Date(Date.now() - 10),
        completedAt: new Date(),
        durationMs: 10,
        result: { ok: true, attempt: 2 },
      },
    });
    await prisma.jobLog.create({
      data: {
        jobId,
        executionId: completed.id,
        workerId: worker.id,
        level: "INFO",
        message: "Execution completed",
        metadata: { durationMs: 10 },
      },
    });
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "COMPLETED", attempts: 2, completedAt: new Date() },
    });

    const list = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}/executions`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(list.body.data.items).toHaveLength(2);
    expect(list.body.data.items[0].status).toBe("FAILED");
    expect(list.body.data.items[0].errorCode).toBe("TASK_FAILED");
    expect(list.body.data.items[1].status).toBe("COMPLETED");
    expect(list.body.data.items[1].hasResult).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}/executions/${failed.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(detail.body.data.errorStack).toContain("simulated failure");
    expect(detail.body.data.logs.length).toBeGreaterThanOrEqual(1);

    const successDetail = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}/executions/${completed.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(successDetail.body.data.result).toEqual({ ok: true, attempt: 2 });

    const filtered = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}/logs?executionId=${failed.id}&level=ERROR`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(filtered.body.data.items).toHaveLength(1);
    expect(filtered.body.data.items[0].executionId).toBe(failed.id);

    // Cancel of a claimed attempt closes the open execution record.
    const openJob = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        queueId,
        name: "Open claim",
        type: "IMMEDIATE",
        taskType: "test_timeout",
        payload: {},
      })
      .expect(201);
    const openJobId = openJob.body.data.job.id as string;
    const openExec = await prisma.jobExecution.create({
      data: {
        jobId: openJobId,
        workerId: worker.id,
        attemptNumber: 1,
        status: "RUNNING",
        startedAt: new Date(),
      },
    });
    await prisma.job.update({
      where: { id: openJobId },
      data: { status: "RUNNING", attempts: 1, lockedBy: worker.workerId, lockedAt: new Date() },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${openJobId}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const closed = await prisma.jobExecution.findUniqueOrThrow({ where: { id: openExec.id } });
    expect(closed.status).toBe("CANCELLED");
    expect(closed.errorCode).toBe("CANCELLED");
  });
});
