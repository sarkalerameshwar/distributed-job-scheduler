import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  APP_NAME,
  APP_VERSION,
  type DependencyCheck,
  type HealthResponse,
  type HealthStatus,
} from "@djs/shared-types";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../common/redis.service";
import { MetricsService } from "../metrics/metrics.service";

const startedAt = Date.now();

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  async getHealth(): Promise<HealthResponse> {
    const [mysql, redis, workers] = await Promise.all([
      this.checkMysql(),
      this.checkRedis(),
      this.checkWorkers(),
    ]);
    const checks = [mysql, redis, workers];
    const status = this.rollUp(checks.map((c) => c.status));
    const { snapshot } = await this.metrics.getSnapshot();
    return this.envelope(status, checks, snapshot);
  }

  getLiveness(): HealthResponse {
    return this.envelope("ok", [{ name: "process", status: "ok" }]);
  }

  async getReadiness(): Promise<HealthResponse> {
    const health = await this.getHealth();
    // Ready requires MySQL + Redis; workers may be zero (degraded but ready for API traffic).
    const depsDown = health.checks.some(
      (c) => (c.name === "mysql" || c.name === "redis") && c.status === "down",
    );
    if (depsDown) {
      throw new ServiceUnavailableException(health);
    }
    return health;
  }

  async getPrometheus(): Promise<string> {
    return this.metrics.renderPrometheus();
  }

  private envelope(
    status: HealthStatus,
    checks: DependencyCheck[],
    metrics?: HealthResponse["metrics"],
  ): HealthResponse {
    return {
      status,
      service: APP_NAME,
      version: APP_VERSION,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      checks,
      ...(metrics ? { metrics } : {}),
    };
  }

  private rollUp(statuses: HealthStatus[]): HealthStatus {
    if (statuses.includes("down")) {
      return "down";
    }
    if (statuses.includes("degraded")) {
      return "degraded";
    }
    return "ok";
  }

  private async checkMysql(): Promise<DependencyCheck> {
    const started = Date.now();
    try {
      await this.prisma.$queryRawUnsafe("SELECT 1");
      return { name: "mysql", status: "ok", latencyMs: Date.now() - started };
    } catch (error) {
      return {
        name: "mysql",
        status: "down",
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "unknown",
      };
    }
  }

  private async checkRedis(): Promise<DependencyCheck> {
    const started = Date.now();
    try {
      const pong = await this.redis.ping();
      if (pong !== "PONG") {
        return { name: "redis", status: "degraded", latencyMs: Date.now() - started, error: pong };
      }
      return { name: "redis", status: "ok", latencyMs: Date.now() - started };
    } catch (error) {
      return {
        name: "redis",
        status: "down",
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "unknown",
      };
    }
  }

  private async checkWorkers(): Promise<DependencyCheck> {
    const started = Date.now();
    try {
      const online = await this.prisma.worker.count({ where: { status: "ONLINE" } });
      if (online === 0) {
        return {
          name: "workers",
          status: "degraded",
          latencyMs: Date.now() - started,
          error: "no_online_workers",
        };
      }
      return { name: "workers", status: "ok", latencyMs: Date.now() - started };
    } catch (error) {
      return {
        name: "workers",
        status: "down",
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "unknown",
      };
    }
  }
}
