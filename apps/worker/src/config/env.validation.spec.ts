import "reflect-metadata";
import { validateWorkerEnvironment } from "./env.validation";

describe("validateWorkerEnvironment", () => {
  const valid = {
    NODE_ENV: "test",
    WORKER_HEALTH_PORT: 3001,
    DATABASE_URL: "mysql://scheduler:scheduler_dev@localhost:3306/job_scheduler",
    REDIS_HOST: "localhost",
    REDIS_PORT: 6379,
    WORKER_CONCURRENCY: 10,
    HEARTBEAT_INTERVAL_MS: 5000,
    JOB_DEFAULT_TIMEOUT_MS: 30000,
    JWT_ACCESS_SECRET: "change-me-access-secret-min-32-chars-long",
    JWT_REFRESH_SECRET: "change-me-refresh-secret-min-32-chars-long",
  };

  it("accepts a complete worker configuration", () => {
    expect(validateWorkerEnvironment(valid).WORKER_HEALTH_PORT).toBe(3001);
  });

  it("rejects missing Redis host", () => {
    const { REDIS_HOST: _, ...rest } = valid;
    expect(() => validateWorkerEnvironment(rest)).toThrow(/Invalid worker environment/);
  });
});
