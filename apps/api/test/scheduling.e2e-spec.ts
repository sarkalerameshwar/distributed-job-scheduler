import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { getNextCronRun } from "@djs/shared-types";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { requestIdMiddleware } from "../src/common/request-id.middleware";
import { EnvService } from "../src/config/env.service";

describe("Scheduling (e2e)", () => {
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
    if (app) {
      await app.close();
    }
  });

  it("creates delayed/recurring jobs, previews cron, and pause/resume schedules", async () => {
    const email = `sched.${suffix}@example.com`;
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "Phase11Test!99", name: "Sched User" })
      .expect(201);
    const token = registered.body.data.tokens.accessToken as string;

    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `Sched Org ${suffix}`, slug: `sched-org-${suffix}` })
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
      .send({ organizationId, name: "Sched Project", slug: `sched-proj-${suffix}` })
      .expect(201);

    const queue = await request(app.getHttpServer())
      .post("/api/v1/queues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId: project.body.data.id,
        name: "timed",
        retryPolicyId,
      })
      .expect(201);
    const queueId = queue.body.data.id as string;

    const preview = await request(app.getHttpServer())
      .post("/api/v1/schedules/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cronExpression: "0 * * * *",
        timezone: "UTC",
        count: 3,
        from: "2026-08-22T12:00:00.000Z",
      })
      .expect(201);
    expect(preview.body.data.nextRuns).toEqual([
      "2026-08-22T13:00:00.000Z",
      "2026-08-22T14:00:00.000Z",
      "2026-08-22T15:00:00.000Z",
    ]);

    await request(app.getHttpServer())
      .post("/api/v1/schedules/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({ cronExpression: "0 9 * *", timezone: "UTC" })
      .expect(422);

    const delayed = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        queueId,
        name: "Delayed ping",
        type: "DELAYED",
        taskType: "send_notification",
        payload: { userId: "u1", channel: "in_app", template: "ping" },
        delayMs: 3_600_000,
      })
      .expect(201);
    expect(delayed.body.data.job.status).toBe("SCHEDULED");
    expect(delayed.body.data.job.schedule.scheduleType).toBe("DELAY");

    const expectedNext = getNextCronRun("*/10 * * * *", {
      timezone: "UTC",
    }).toISOString();

    const recurring = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        queueId,
        name: "Every 10m",
        type: "RECURRING",
        taskType: "cleanup",
        payload: { path: "/tmp" },
        cronExpression: "*/10 * * * *",
        timezone: "UTC",
      })
      .expect(201);
    expect(recurring.body.data.job.status).toBe("SCHEDULED");
    expect(recurring.body.data.job.schedule.scheduleType).toBe("CRON");
    expect(recurring.body.data.job.schedule.nextRunAt).toBe(expectedNext);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/schedules?organizationId=${organizationId}&active=true`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(list.body.data.items.length).toBeGreaterThanOrEqual(2);

    const cronSchedule = list.body.data.items.find(
      (s: { scheduleType: string }) => s.scheduleType === "CRON",
    );
    expect(cronSchedule).toBeTruthy();

    const paused = await request(app.getHttpServer())
      .post(`/api/v1/schedules/${cronSchedule.id}/pause`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(paused.body.data.active).toBe(false);

    const resumed = await request(app.getHttpServer())
      .post(`/api/v1/schedules/${cronSchedule.id}/resume`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(resumed.body.data.active).toBe(true);
    expect(resumed.body.data.nextRunAt).toBeTruthy();

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/schedules/${cronSchedule.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ cronExpression: "0 9 * * *" })
      .expect(200);
    expect(patched.body.data.cronExpression).toBe("0 9 * * *");
  });
});
