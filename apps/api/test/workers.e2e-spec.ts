import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { requestIdMiddleware } from "../src/common/request-id.middleware";
import { EnvService } from "../src/config/env.service";

describe("Workers API (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const suffix = Date.now();
  let workerDbId: string | undefined;

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
    if (workerDbId) {
      await prisma.workerHeartbeat.deleteMany({ where: { workerId: workerDbId } });
      await prisma.worker.delete({ where: { id: workerDbId } }).catch(() => undefined);
    }
    await app.close();
    await prisma.$disconnect();
  });

  it("lists workers and returns heartbeat detail", async () => {
    const email = `workers.${suffix}@example.com`;
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "Phase12Test!99", name: "Workers User" })
      .expect(201);
    const token = registered.body.data.tokens.accessToken as string;

    const worker = await prisma.worker.create({
      data: {
        workerId: `api-worker-${suffix}`,
        hostname: "api-test",
        processId: 99,
        version: "0.1.0",
        status: "ONLINE",
        concurrency: 4,
        currentJobCount: 0,
        lastHeartbeatAt: new Date(),
      },
    });
    workerDbId = worker.id;

    await prisma.workerHeartbeat.create({
      data: {
        workerId: worker.id,
        currentJobCount: 0,
        memoryUsage: BigInt(1024),
      },
    });

    const listed = await request(app.getHttpServer())
      .get("/api/v1/workers?status=ONLINE")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(listed.body.data.items.some((row: { id: string }) => row.id === worker.id)).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/workers/${worker.workerId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(detail.body.data.workerId).toBe(worker.workerId);
    expect(detail.body.data.recentHeartbeats.length).toBeGreaterThanOrEqual(1);
  });
});
