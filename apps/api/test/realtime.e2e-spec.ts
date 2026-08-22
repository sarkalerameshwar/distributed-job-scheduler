import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { requestIdMiddleware } from "../src/common/request-id.middleware";
import { EnvService } from "../src/config/env.service";
import { RealtimePublisher } from "../src/realtime/realtime.publisher";

describe("Realtime WebSocket (e2e)", () => {
  let app: INestApplication;
  let baseUrl: string;
  const suffix = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    app.use(requestIdMiddleware);
    app.setGlobalPrefix("api/v1", { exclude: ["health", "health/live", "health/ready", "metrics"] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter(app.get(EnvService)));
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("authenticates, joins an org room, and receives Redis-published events", async () => {
    const email = `rt.${suffix}@example.com`;
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "Phase14Test!99", name: "Realtime User" })
      .expect(201);
    const token = registered.body.data.tokens.accessToken as string;

    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `RT Org ${suffix}`, slug: `rt-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.data.id as string;

    const socket: Socket = io(`${baseUrl}/realtime`, {
      path: "/socket.io",
      transports: ["websocket"],
      auth: { token },
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("socket connect timeout")), 8_000);
      socket.on("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const subscribed = await new Promise<{ ok: boolean }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("subscribe timeout")), 5_000);
      socket.emit("subscribe.org", { organizationId }, (ack: { ok: boolean }) => {
        clearTimeout(timer);
        resolve(ack);
      });
    });
    expect(subscribed.ok).toBe(true);

    const received = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("event timeout")), 5_000);
      socket.on("job.updated", (event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });

    await app.get(RealtimePublisher).jobUpdated(organizationId, {
      jobId: "test-job",
      status: "QUEUED",
    });

    const event = (await received) as { type: string; organizationId: string; payload: { jobId: string } };
    expect(event.type).toBe("job.updated");
    expect(event.organizationId).toBe(organizationId);
    expect(event.payload.jobId).toBe("test-job");

    socket.disconnect();
  });
});
