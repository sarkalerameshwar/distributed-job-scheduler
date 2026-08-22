import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load root `.env` for local e2e, then apply CI-safe defaults so GitHub Actions
 * can run without committing secrets.
 */
function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(__dirname, "../../../.env"));

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.PORT = process.env.PORT || "3000";
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "mysql://scheduler:scheduler_dev@127.0.0.1:3306/job_scheduler";
process.env.REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
process.env.REDIS_PORT = process.env.REDIS_PORT || "6379";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "ci-access-secret-min-32-characters-long!!";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "ci-refresh-secret-min-32-characters-long!";
process.env.JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY || "10";
process.env.HEARTBEAT_INTERVAL_MS = process.env.HEARTBEAT_INTERVAL_MS || "5000";
process.env.HEARTBEAT_TIMEOUT_MS = process.env.HEARTBEAT_TIMEOUT_MS || "15000";
process.env.JOB_DEFAULT_TIMEOUT_MS = process.env.JOB_DEFAULT_TIMEOUT_MS || "30000";
