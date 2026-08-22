import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { requestIdMiddleware } from "../src/common/request-id.middleware";
import { EnvService } from "../src/config/env.service";

describe("Auth (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware);
    app.setGlobalPrefix("api/v1", {
      exclude: ["health", "health/live", "health/ready", "metrics"],
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter(app.get(EnvService)));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects login with invalid credentials without revealing whether the email exists", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: "not-the-password" })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(res.body.requestId).toBeTruthy();
  });

  it("registers, reads /me, refreshes, and logs out", async () => {
    const email = `phase3.${Date.now()}@example.com`;
    const password = "Phase3Test!99";

    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "Phase Three" })
      .expect(201);

    expect(registered.body.success).toBe(true);
    expect(registered.body.data.user.email).toBe(email);
    expect(registered.body.data.user.passwordHash).toBeUndefined();
    const accessToken = registered.body.data.tokens.accessToken as string;
    const refreshToken = registered.body.data.tokens.refreshToken as string;

    const me = await request(app.getHttpServer())
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.data.user.email).toBe(email);

    const refreshed = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken })
      .expect(200);
    expect(refreshed.body.data.tokens.accessToken).toBeTruthy();
    expect(refreshed.body.data.tokens.refreshToken).not.toBe(refreshToken);

    await request(app.getHttpServer()).post("/api/v1/auth/refresh").send({ refreshToken }).expect(401);

    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${refreshed.body.data.tokens.accessToken}`)
      .send({ refreshToken: refreshed.body.data.tokens.refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: refreshed.body.data.tokens.refreshToken })
      .expect(401);
  });

  it("rejects a weak password with 422", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: `weak.${Date.now()}@example.com`, password: "password12x", name: "Weak" })
      .expect(422);
    expect(res.body.error.code).toBe("PASSWORD_POLICY");
  });

  it("requires a bearer token for /auth/me", async () => {
    await request(app.getHttpServer()).get("/api/v1/auth/me").expect(401);
  });
});
