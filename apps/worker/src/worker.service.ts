import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { APP_NAME, APP_VERSION, type DependencyCheck, type HealthResponse } from "@djs/shared-types";
import { EnvService } from "./config/env.service";
import { PrismaService } from "./prisma.service";
import { RedisClientService } from "./redis-client.service";
import { WorkerContext } from "./worker-context";
import { HeartbeatService } from "./heartbeat.service";
import { JobClaimService } from "./job-claim.service";
import { JobProcessorService } from "./job-processor.service";
import { StaleRecoveryService } from "./stale-recovery.service";
import { RealtimePublisher } from "./realtime.publisher";
import { WorkerMetricsService } from "./worker-metrics.service";

const startedAt = Date.now();

@Injectable()
export class WorkerService implements OnModuleInit {
  private readonly logger = new Logger(WorkerService.name);
  private pollTimer?: NodeJS.Timeout;
  private recoveryTimer?: NodeJS.Timeout;

  constructor(
    private readonly env: EnvService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisClientService,
    private readonly ctx: WorkerContext,
    private readonly heartbeat: HeartbeatService,
    private readonly claim: JobClaimService,
    private readonly processor: JobProcessorService,
    private readonly recovery: StaleRecoveryService,
    private readonly realtime: RealtimePublisher,
    private readonly metrics: WorkerMetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.register();
    this.heartbeat.start();
    this.startRecovery();
    if (process.env.WORKER_DISABLE_CLAIM === "true") {
      this.logger.warn(
        JSON.stringify({
          msg: "worker_claim_disabled",
          workerId: this.ctx.identity.workerId,
          reason: "WORKER_DISABLE_CLAIM=true",
        }),
      );
    } else {
      this.startPolling();
    }
    this.logger.log(
      JSON.stringify({
        msg: "worker_online",
        ...this.ctx.identity,
        concurrency: this.env.concurrency,
        pollIntervalMs: this.env.pollIntervalMs,
        heartbeatTimeoutMs: this.env.heartbeatTimeoutMs,
        recoveryIntervalMs: this.env.recoveryIntervalMs,
        claimEnabled: process.env.WORKER_DISABLE_CLAIM !== "true",
      }),
    );
  }

  get identity() {
    return this.ctx.identity;
  }

  private async register(): Promise<void> {
    const existing = await this.prisma.worker.findUnique({
      where: { workerId: this.ctx.identity.workerId },
    });

    const worker = existing
      ? await this.prisma.worker.update({
          where: { id: existing.id },
          data: {
            hostname: this.ctx.identity.hostname,
            processId: this.ctx.identity.processId,
            version: this.ctx.identity.version,
            status: "STARTING",
            concurrency: this.env.concurrency,
            currentJobCount: 0,
            startedAt: new Date(),
            stoppedAt: null,
            lastHeartbeatAt: new Date(),
          },
        })
      : await this.prisma.worker.create({
          data: {
            workerId: this.ctx.identity.workerId,
            hostname: this.ctx.identity.hostname,
            processId: this.ctx.identity.processId,
            version: this.ctx.identity.version,
            status: "STARTING",
            concurrency: this.env.concurrency,
            currentJobCount: 0,
            lastHeartbeatAt: new Date(),
          },
        });

    this.ctx.dbId = worker.id;

    await this.prisma.worker.update({
      where: { id: worker.id },
      data: { status: "ONLINE" },
    });
    void this.realtime.workerUpdated({
      workerId: this.ctx.identity.workerId,
      status: "ONLINE",
    });
  }

  private startPolling(): void {
    const tick = async () => {
      if (this.ctx.draining) {
        return;
      }
      try {
        await this.claim.promoteDueJobs();
        while (!this.ctx.draining && this.ctx.currentJobCount < this.env.concurrency) {
          const job = await this.claim.claimNext();
          if (!job) {
            break;
          }
          // Fire-and-forget; concurrency is gated by activeJobIds + claim loop.
          void this.processor.process(job);
        }
      } catch (error) {
        this.logger.error(
          JSON.stringify({
            msg: "poll_error",
            error: error instanceof Error ? error.message : "unknown",
          }),
        );
      }
    };

    void tick();
    this.pollTimer = setInterval(() => void tick(), this.env.pollIntervalMs);
    this.pollTimer.unref();
  }

  private startRecovery(): void {
    const tick = async () => {
      if (this.ctx.draining) {
        return;
      }
      try {
        await this.recovery.run();
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            msg: "recovery_error",
            error: error instanceof Error ? error.message : "unknown",
          }),
        );
      }
    };

    void tick();
    this.recoveryTimer = setInterval(() => void tick(), this.env.recoveryIntervalMs);
    this.recoveryTimer.unref();
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = undefined;
    }
  }

  async getHealth(): Promise<HealthResponse> {
    const checks: DependencyCheck[] = [];
    const mysqlStarted = Date.now();
    try {
      await this.prisma.$queryRawUnsafe("SELECT 1");
      checks.push({ name: "mysql", status: "ok", latencyMs: Date.now() - mysqlStarted });
    } catch (error) {
      checks.push({
        name: "mysql",
        status: "down",
        latencyMs: Date.now() - mysqlStarted,
        error: error instanceof Error ? error.message : "unknown",
      });
    }

    const redisStarted = Date.now();
    try {
      await this.redis.ping();
      checks.push({ name: "redis", status: "ok", latencyMs: Date.now() - redisStarted });
    } catch (error) {
      checks.push({
        name: "redis",
        status: "down",
        latencyMs: Date.now() - redisStarted,
        error: error instanceof Error ? error.message : "unknown",
      });
    }

    checks.push({
      name: "worker",
      status: this.ctx.draining ? "degraded" : "ok",
      latencyMs: this.ctx.currentJobCount,
    });

    const down = checks.some((c) => c.status === "down");
    return {
      status: down ? "down" : "ok",
      service: `${APP_NAME}-worker`,
      version: APP_VERSION,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  getPrometheusPlaceholder(): string {
    return this.metrics.render(
      this.ctx.currentJobCount,
      this.ctx.draining,
      this.ctx.identity.workerId,
    );
  }
}
