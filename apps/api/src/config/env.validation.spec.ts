import "reflect-metadata";
import { validateEnvironment } from "./env.validation";

describe("validateEnvironment", () => {
  const valid = {
    NODE_ENV: "test",
    PORT: 3000,
    DATABASE_URL: "mysql://scheduler:scheduler_dev@localhost:3306/job_scheduler",
    REDIS_HOST: "localhost",
    REDIS_PORT: 6379,
    JWT_ACCESS_SECRET: "change-me-access-secret-min-32-chars-long",
    JWT_REFRESH_SECRET: "change-me-refresh-secret-min-32-chars-long",
    JWT_ACCESS_EXPIRES_IN: "15m",
    JWT_REFRESH_EXPIRES_IN: "7d",
    CORS_ORIGIN: "http://localhost:5173",
    WORKER_CONCURRENCY: 10,
    HEARTBEAT_INTERVAL_MS: 5000,
    HEARTBEAT_TIMEOUT_MS: 15000,
    JOB_DEFAULT_TIMEOUT_MS: 30000,
  };

  it("accepts a complete configuration", () => {
    const result = validateEnvironment(valid);
    expect(result.PORT).toBe(3000);
    expect(result.REDIS_HOST).toBe("localhost");
  });

  it("rejects a short JWT secret", () => {
    expect(() =>
      validateEnvironment({
        ...valid,
        JWT_ACCESS_SECRET: "too-short",
      }),
    ).toThrow(/Invalid environment configuration/);
  });

  it("rejects a missing DATABASE_URL", () => {
    const { DATABASE_URL: _, ...rest } = valid;
    expect(() => validateEnvironment(rest)).toThrow(/Invalid environment configuration/);
  });
});
