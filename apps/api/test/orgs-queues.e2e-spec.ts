import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { requestIdMiddleware } from "../src/common/request-id.middleware";
import { EnvService } from "../src/config/env.service";

describe("Organizations, projects, queues (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const suffix = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient();
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
    await prisma.$disconnect();
  });

  async function register(name: string) {
    const email = `${name}.${suffix}@example.com`;
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "Phase4Test!99", name })
      .expect(201);
    return {
      email,
      token: res.body.data.tokens.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  }

  it("creates org/project/queue, pauses, resumes, and enforces VIEWER RBAC", async () => {
    const owner = await register("owner");
    const viewer = await register("viewer");

    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: `Org ${suffix}`, slug: `org-${suffix}` })
      .expect(201);
    const organizationId = org.body.data.id as string;
    expect(org.body.data.role).toBe("OWNER");

    await request(app.getHttpServer())
      .get("/api/v1/organizations")
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.data.items).toHaveLength(0);
      });

    const policies = await request(app.getHttpServer())
      .get(`/api/v1/retry-policies?organizationId=${organizationId}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(200);
    const policyId = policies.body.data[0].id as string;

    const project = await request(app.getHttpServer())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ organizationId, name: "Notifications", slug: `notif-${suffix}` })
      .expect(201);

    await prisma.organizationMember.create({
      data: { organizationId, userId: viewer.userId, role: "VIEWER" },
    });

    await request(app.getHttpServer())
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({ organizationId, name: "Should fail" })
      .expect(403);

    const queue = await request(app.getHttpServer())
      .post("/api/v1/queues")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        projectId: project.body.data.id,
        name: "email",
        retryPolicyId: policyId,
        maxConcurrency: 3,
      })
      .expect(201);

    const paused = await request(app.getHttpServer())
      .post(`/api/v1/queues/${queue.body.data.id}/pause`)
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(201);
    expect(paused.body.data.status).toBe("PAUSED");

    const resumed = await request(app.getHttpServer())
      .post(`/api/v1/queues/${queue.body.data.id}/resume`)
      .set("Authorization", `Bearer ${owner.token}`)
      .expect(201);
    expect(resumed.body.data.status).toBe("ACTIVE");

    const stats = await request(app.getHttpServer())
      .get(`/api/v1/queues/${queue.body.data.id}/stats`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(200);
    expect(stats.body.data.counts.QUEUED).toBe(0);

    await request(app.getHttpServer())
      .post(`/api/v1/queues/${queue.body.data.id}/pause`)
      .set("Authorization", `Bearer ${viewer.token}`)
      .expect(403);
  });
});
