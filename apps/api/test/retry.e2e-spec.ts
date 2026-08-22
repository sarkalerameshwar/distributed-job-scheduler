import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { calculateRetryDelay } from "@djs/shared-types";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { requestIdMiddleware } from "../src/common/request-id.middleware";
import { EnvService } from "../src/config/env.service";

describe("Retry / backoff (e2e)", () => {
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

  it("previews FIXED/LINEAR/EXPONENTIAL schedules and patches policies", async () => {
    const email = `retry.${suffix}@example.com`;
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "Phase9Test!99", name: "Retry User" })
      .expect(201);
    const token = registered.body.data.tokens.accessToken as string;

    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `Retry Org ${suffix}`, slug: `retry-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.data.id as string;

    const fixedPreview = await request(app.getHttpServer())
      .post("/api/v1/retry-policies/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({
        strategy: "FIXED",
        maxAttempts: 4,
        initialDelayMs: 5_000,
        maxDelayMs: 60_000,
        multiplier: 2,
      })
      .expect(201);
    expect(fixedPreview.body.data.schedule.map((s: { delayMs: number }) => s.delayMs)).toEqual([
      5_000, 5_000, 5_000,
    ]);

    const linearPreview = await request(app.getHttpServer())
      .post("/api/v1/retry-policies/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({
        strategy: "LINEAR",
        maxAttempts: 4,
        initialDelayMs: 2_000,
        maxDelayMs: 60_000,
      })
      .expect(201);
    expect(linearPreview.body.data.schedule.map((s: { delayMs: number }) => s.delayMs)).toEqual([
      2_000, 4_000, 6_000,
    ]);

    const expPreview = await request(app.getHttpServer())
      .post("/api/v1/retry-policies/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({
        strategy: "EXPONENTIAL",
        maxAttempts: 5,
        initialDelayMs: 1_000,
        maxDelayMs: 10_000,
        multiplier: 2,
        attempt: 20,
      })
      .expect(201);
    expect(expPreview.body.data.schedule.map((s: { delayMs: number }) => s.delayMs)).toEqual([
      1_000, 2_000, 4_000, 8_000,
    ]);
    expect(expPreview.body.data.delayForAttempt).toBe(10_000);
    expect(expPreview.body.data.totalBackoffMs).toBe(15_000);

    const created = await request(app.getHttpServer())
      .post("/api/v1/retry-policies")
      .set("Authorization", `Bearer ${token}`)
      .send({
        organizationId,
        name: `custom-exp-${suffix}`,
        strategy: "EXPONENTIAL",
        maxAttempts: 4,
        initialDelayMs: 100,
        maxDelayMs: 50,
        multiplier: 2,
      })
      .expect(422);
    expect(created.body.error.code).toBe("INVALID_RETRY_DELAYS");

    const policy = await request(app.getHttpServer())
      .post("/api/v1/retry-policies")
      .set("Authorization", `Bearer ${token}`)
      .send({
        organizationId,
        name: `custom-exp-${suffix}`,
        strategy: "EXPONENTIAL",
        maxAttempts: 4,
        initialDelayMs: 100,
        maxDelayMs: 5_000,
        multiplier: 3,
      })
      .expect(201);

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/retry-policies/${policy.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ initialDelayMs: 200, multiplier: 2 })
      .expect(200);
    expect(patched.body.data.initialDelayMs).toBe(200);
    expect(patched.body.data.multiplier).toBe(2);

    const fromPolicy = await request(app.getHttpServer())
      .post("/api/v1/retry-policies/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({ policyId: policy.body.data.id })
      .expect(201);
    expect(fromPolicy.body.data.schedule[0].delayMs).toBe(
      calculateRetryDelay({
        strategy: "EXPONENTIAL",
        attempt: 1,
        initialDelayMs: 200,
        maxDelayMs: 5_000,
        multiplier: 2,
      }),
    );
  });
});
