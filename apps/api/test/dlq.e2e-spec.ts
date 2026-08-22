import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { requestIdMiddleware } from "../src/common/request-id.middleware";
import { EnvService } from "../src/config/env.service";

describe("DLQ (e2e)", () => {
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

  it("lists open DLQ entries and supports retry / discard / resolve", async () => {
    const email = `dlq.${suffix}@example.com`;
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "Phase10Test!99", name: "DLQ User" })
      .expect(201);
    const token = registered.body.data.tokens.accessToken as string;

    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `DLQ Org ${suffix}`, slug: `dlq-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.data.id as string;

    const project = await request(app.getHttpServer())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ organizationId, name: `DLQ Project ${suffix}`, slug: `dlq-proj-${suffix}` })
      .expect(201);
    const projectId = project.body.data.id as string;

    const policies = await request(app.getHttpServer())
      .get(`/api/v1/retry-policies?organizationId=${organizationId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const retryPolicyId = policies.body.data[0].id as string;

    const queue = await request(app.getHttpServer())
      .post("/api/v1/queues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId,
        name: `dlq-q-${suffix}`,
        maxConcurrency: 2,
        retryPolicyId,
      })
      .expect(201);
    const queueId = queue.body.data.id as string;

    async function seedDlqJob(name: string) {
      const created = await request(app.getHttpServer())
        .post("/api/v1/jobs")
        .set("Authorization", `Bearer ${token}`)
        .send({
          queueId,
          name,
          type: "IMMEDIATE",
          taskType: "test_success",
          payload: {},
        })
        .expect(201);
      const jobId = created.body.data.job.id as string;

      const execution = await prisma.jobExecution.create({
        data: {
          jobId,
          attemptNumber: 1,
          status: "FAILED",
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 12,
          errorCode: "TEST",
          errorMessage: "seeded failure",
          errorStack: "Error: seeded failure",
        },
      });

      await prisma.job.update({
        where: { id: jobId },
        data: { status: "DLQ", attempts: 3, failedAt: new Date() },
      });

      const dlq = await prisma.deadLetterJob.create({
        data: {
          jobId,
          finalExecutionId: execution.id,
          reason: "max_attempts_exhausted",
          finalError: "seeded failure",
          attempts: 3,
        },
      });

      return { jobId, dlqId: dlq.id };
    }

    const retryTarget = await seedDlqJob(`dlq-retry-${suffix}`);
    const discardTarget = await seedDlqJob(`dlq-discard-${suffix}`);
    const resolveTarget = await seedDlqJob(`dlq-resolve-${suffix}`);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/dlq?organizationId=${organizationId}&resolved=false`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(listed.body.data.total).toBeGreaterThanOrEqual(3);
    expect(listed.body.data.items.some((row: { id: string }) => row.id === retryTarget.dlqId)).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/dlq/${retryTarget.dlqId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(detail.body.data.finalExecution?.errorMessage).toBe("seeded failure");
    expect(detail.body.data.finalExecution?.errorStack).toContain("seeded failure");

    const retried = await request(app.getHttpServer())
      .post(`/api/v1/dlq/${retryTarget.dlqId}/retry`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(retried.body.data.job.status).toBe("QUEUED");
    expect(retried.body.data.deadLetter.resolution).toBe("RETRIED");
    expect(retried.body.data.deadLetter.resolvedAt).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/api/v1/dlq/${retryTarget.dlqId}/retry`)
      .set("Authorization", `Bearer ${token}`)
      .expect(422);

    const discarded = await request(app.getHttpServer())
      .post(`/api/v1/dlq/${discardTarget.dlqId}/discard`)
      .set("Authorization", `Bearer ${token}`)
      .send({ note: "not worth retrying" })
      .expect(201);
    expect(discarded.body.data.resolution).toBe("DISCARDED");
    expect(discarded.body.data.resolvedAt).toBeTruthy();

    const jobAfterDiscard = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${discardTarget.jobId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(jobAfterDiscard.body.data.status).toBe("DLQ");

    const resolved = await request(app.getHttpServer())
      .post(`/api/v1/dlq/${resolveTarget.dlqId}/resolve`)
      .set("Authorization", `Bearer ${token}`)
      .send({ note: "acknowledged" })
      .expect(201);
    expect(resolved.body.data.resolution).toBe("RESOLVED");

    const openOnly = await request(app.getHttpServer())
      .get(`/api/v1/dlq?organizationId=${organizationId}&resolved=false`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(openOnly.body.data.items.every((row: { resolvedAt: string | null }) => row.resolvedAt === null)).toBe(
      true,
    );

    const resolvedOnly = await request(app.getHttpServer())
      .get(`/api/v1/dlq?organizationId=${organizationId}&resolved=true`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(resolvedOnly.body.data.items.length).toBeGreaterThanOrEqual(3);
    expect(
      resolvedOnly.body.data.items.every((row: { resolvedAt: string | null }) => row.resolvedAt !== null),
    ).toBe(true);
  });
});
