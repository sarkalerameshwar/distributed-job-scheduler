import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { requestIdMiddleware } from "../src/common/request-id.middleware";
import { EnvService } from "../src/config/env.service";

describe("Jobs lifecycle (e2e)", () => {
  let app: INestApplication;
  const suffix = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware);
    app.setGlobalPrefix("api/v1", { exclude: ["health", "health/live", "health/ready", "metrics"] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter(app.get(EnvService)));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates immediate/delayed/recurring/batch jobs, cancels, retries, and honors idempotency", async () => {
    const email = `jobs.${suffix}@example.com`;
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "Phase5Test!99", name: "Jobs User" })
      .expect(201);
    const token = registered.body.data.tokens.accessToken as string;

    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `Jobs Org ${suffix}`, slug: `jobs-org-${suffix}` })
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
      .send({ organizationId, name: "Jobs Project", slug: `jobs-proj-${suffix}` })
      .expect(201);

    const queue = await request(app.getHttpServer())
      .post("/api/v1/queues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId: project.body.data.id,
        name: "email",
        retryPolicyId,
        maxConcurrency: 4,
      })
      .expect(201);
    const queueId = queue.body.data.id as string;

    const immediate = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `welcome-${suffix}`)
      .send({
        queueId,
        name: "Welcome",
        type: "IMMEDIATE",
        taskType: "send_email",
        payload: { to: "a@example.com", subject: "Hi", body: "Hello" },
        priority: 8,
      })
      .expect(201);
    expect(immediate.body.data.job.status).toBe("QUEUED");
    expect(immediate.body.data.idempotentReplay).toBe(false);
    const jobId = immediate.body.data.job.id as string;

    const replay = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `welcome-${suffix}`)
      .send({
        queueId,
        name: "Welcome duplicate",
        type: "IMMEDIATE",
        taskType: "send_email",
        payload: { to: "a@example.com" },
      })
      .expect(201);
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect(replay.body.data.job.id).toBe(jobId);

    const delayed = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        queueId,
        name: "Delayed ping",
        type: "DELAYED",
        taskType: "send_notification",
        payload: { userId: "u1", channel: "in_app", template: "ping" },
        delayMs: 600_000,
      })
      .expect(201);
    expect(delayed.body.data.job.status).toBe("SCHEDULED");
    expect(delayed.body.data.job.schedule.scheduleType).toBe("DELAY");

    const recurring = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        queueId,
        name: "Nightly cleanup",
        type: "RECURRING",
        taskType: "cleanup",
        payload: { path: "/tmp" },
        cronExpression: "0 9 * * *",
      })
      .expect(201);
    expect(recurring.body.data.job.status).toBe("SCHEDULED");
    expect(recurring.body.data.job.schedule.cronExpression).toBe("0 9 * * *");

    const batch = await request(app.getHttpServer())
      .post("/api/v1/jobs/batch")
      .set("Authorization", `Bearer ${token}`)
      .send({
        queueId,
        jobs: [
          { name: "Batch A", taskType: "test_success", payload: { n: 1 } },
          { name: "Batch B", taskType: "test_success", payload: { n: 2 } },
        ],
      })
      .expect(201);
    expect(batch.body.data.jobs).toHaveLength(2);
    expect(batch.body.data.batchId).toBeTruthy();

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(cancelled.body.data.status).toBe("CANCELLED");

    const retried = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/retry`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(retried.body.data.status).toBe("QUEUED");

    const logs = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}/logs`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(logs.body.data.items.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        queueId,
        name: "Bad cron",
        type: "RECURRING",
        taskType: "cleanup",
        payload: {},
        cronExpression: "bad",
      })
      .expect(422);
  });
});
