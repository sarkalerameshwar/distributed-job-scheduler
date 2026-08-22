import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { requestIdMiddleware } from "../src/common/request-id.middleware";
import { EnvService } from "../src/config/env.service";

describe("Health & metrics (e2e)", () => {
  let app: INestApplication;

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

  it("exposes health snapshot and prometheus metrics", async () => {
    const health = await request(app.getHttpServer()).get("/health").expect(200);
    expect(health.body.status).toMatch(/ok|degraded/);
    expect(health.body.checks.some((c: { name: string }) => c.name === "mysql")).toBe(true);
    expect(health.body.checks.some((c: { name: string }) => c.name === "redis")).toBe(true);
    expect(health.body.checks.some((c: { name: string }) => c.name === "workers")).toBe(true);
    expect(health.body.metrics).toBeDefined();
    expect(typeof health.body.metrics.queueDepth).toBe("number");
    expect(typeof health.body.metrics.openDlq).toBe("number");

    await request(app.getHttpServer()).get("/health/live").expect(200);
    await request(app.getHttpServer()).get("/health/ready").expect(200);

    // Drive an HTTP counter via a versioned route.
    await request(app.getHttpServer()).get("/api/v1/auth/me").expect(401);

    const metrics = await request(app.getHttpServer()).get("/metrics").expect(200);
    expect(metrics.headers["content-type"]).toMatch(/text\/plain/);
    expect(metrics.text).toContain("djs_process_up 1");
    expect(metrics.text).toContain("djs_mysql_up");
    expect(metrics.text).toContain("djs_redis_up");
    expect(metrics.text).toContain("djs_queue_depth");
    expect(metrics.text).toContain("djs_http_requests_total");
  });
});
