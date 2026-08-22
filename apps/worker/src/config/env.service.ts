import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class EnvService {
  constructor(private readonly config: ConfigService) {}

  get nodeEnv(): string {
    return this.config.getOrThrow<string>("NODE_ENV");
  }

  get healthPort(): number {
    return Number(this.config.getOrThrow("WORKER_HEALTH_PORT"));
  }

  get redisHost(): string {
    return this.config.getOrThrow<string>("REDIS_HOST");
  }

  get redisPort(): number {
    return Number(this.config.getOrThrow("REDIS_PORT"));
  }

  get redisPassword(): string | undefined {
    return this.config.get<string>("REDIS_PASSWORD") || undefined;
  }

  get concurrency(): number {
    return Number(this.config.getOrThrow("WORKER_CONCURRENCY"));
  }

  get heartbeatIntervalMs(): number {
    return Number(this.config.getOrThrow("HEARTBEAT_INTERVAL_MS"));
  }

  get heartbeatTimeoutMs(): number {
    return Number(this.config.get("HEARTBEAT_TIMEOUT_MS") ?? 15_000);
  }

  get heartbeatRetentionDays(): number {
    return Number(this.config.get("HEARTBEAT_RETENTION_DAYS") ?? 7);
  }

  get recoveryIntervalMs(): number {
    return Number(this.config.get("WORKER_RECOVERY_INTERVAL_MS") ?? this.heartbeatTimeoutMs);
  }

  get jobDefaultTimeoutMs(): number {
    return Number(this.config.getOrThrow("JOB_DEFAULT_TIMEOUT_MS"));
  }

  get pollIntervalMs(): number {
    return Number(this.config.get("WORKER_POLL_INTERVAL_MS") ?? 1000);
  }

  get shutdownGraceMs(): number {
    return Number(this.config.get("SHUTDOWN_GRACE_MS") ?? 30_000);
  }

  get version(): string {
    return this.config.get<string>("WORKER_VERSION") ?? "0.1.0";
  }
}
