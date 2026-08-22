import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { memoryUsage } from "process";
import { EnvService } from "./config/env.service";
import { PrismaService } from "./prisma.service";
import { WorkerContext } from "./worker-context";
import { WorkerMetricsService } from "./worker-metrics.service";

@Injectable()
export class HeartbeatService implements OnModuleInit {
  private readonly logger = new Logger(HeartbeatService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly env: EnvService,
    private readonly prisma: PrismaService,
    private readonly ctx: WorkerContext,
    private readonly metrics: WorkerMetricsService,
  ) {}

  onModuleInit(): void {
    // Started explicitly after worker registration via start().
  }

  start(): void {
    if (this.timer) {
      return;
    }
    void this.beat();
    this.timer = setInterval(() => void this.beat(), this.env.heartbeatIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async beat(): Promise<void> {
    if (!this.ctx.dbId || this.ctx.draining) {
      return;
    }
    const mem = memoryUsage().rss;
    try {
      await this.prisma.worker.update({
        where: { id: this.ctx.dbId },
        data: {
          lastHeartbeatAt: new Date(),
          currentJobCount: this.ctx.currentJobCount,
          status: "ONLINE",
        },
      });
      await this.prisma.workerHeartbeat.create({
        data: {
          workerId: this.ctx.dbId,
          currentJobCount: this.ctx.currentJobCount,
          memoryUsage: BigInt(mem),
          metadata: { workerId: this.ctx.identity.workerId },
        },
      });
      this.metrics.incHeartbeat();
      this.logger.debug(
        JSON.stringify({
          msg: "worker_heartbeat",
          workerId: this.ctx.identity.workerId,
          currentJobCount: this.ctx.currentJobCount,
        }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          msg: "heartbeat_failed",
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
