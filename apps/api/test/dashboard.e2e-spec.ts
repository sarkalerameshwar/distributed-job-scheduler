import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { requestIdMiddleware } from "../src/common/request-id.middleware";
import { EnvService } from "../src/config/env.service";

describe("Dashboard (e2e)", () => {
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

  it("returns org overview KPIs and series", async () => {
    const email = `dash.${suffix}@example.com`;
    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "Phase13Test!99", name: "Dash User" })
      .expect(201);
    const token = registered.body.data.tokens.accessToken as string;

    const org = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: `Dash Org ${suffix}`, slug: `dash-org-${suffix}` })
      .expect(201);
    const organizationId = org.body.data.id as string;

    const overview = await request(app.getHttpServer())
      .get(`/api/v1/dashboard/overview?organizationId=${organizationId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(overview.body.data.organizationId).toBe(organizationId);
    expect(overview.body.data.jobCounts).toBeDefined();
    expect(overview.body.data.workers).toBeDefined();
    expect(Array.isArray(overview.body.data.throughputSeries)).toBe(true);
    expect(overview.body.data.throughputSeries.length).toBeGreaterThan(0);
    expect(overview.body.data.depth).toBe(0);
    expect(overview.body.data.openDlq).toBe(0);
  });
});
