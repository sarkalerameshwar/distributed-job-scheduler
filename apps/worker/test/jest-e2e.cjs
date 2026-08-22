const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
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

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "mysql://scheduler:scheduler_dev@127.0.0.1:3306/job_scheduler";
process.env.REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
process.env.REDIS_PORT = process.env.REDIS_PORT || "6379";
process.env.WORKER_HEALTH_PORT = process.env.WORKER_HEALTH_PORT || "3001";
process.env.WORKER_CONCURRENCY = process.env.WORKER_CONCURRENCY || "10";
process.env.HEARTBEAT_INTERVAL_MS = process.env.HEARTBEAT_INTERVAL_MS || "5000";
process.env.JOB_DEFAULT_TIMEOUT_MS = process.env.JOB_DEFAULT_TIMEOUT_MS || "30000";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "ci-access-secret-min-32-characters-long!!";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "ci-refresh-secret-min-32-characters-long!";

module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".e2e-spec.ts$",
  transform: { "^.+\\.ts$": "ts-jest" },
  testEnvironment: "node",
  testTimeout: 60_000,
};
