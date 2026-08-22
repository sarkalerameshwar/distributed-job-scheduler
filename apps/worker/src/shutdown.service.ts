import { Injectable, Logger } from "@nestjs/common";
import { HeartbeatService } from "./heartbeat.service";
import { WorkerContext } from "./worker-context";
import { PrismaService } from "./prisma.service";
import { EnvService } from "./config/env.service";
import { RealtimePublisher } from "./realtime.publisher";

@Injectable()
export class ShutdownService {
  private readonly logger = new Logger(ShutdownService.name);

  constructor(
    private readonly heartbeat: HeartbeatService,
    private readonly ctx: WorkerContext,
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async drain(): Promise<void> {
    if (this.ctx.draining) {
      return;
    }
    this.ctx.draining = true;
    this.logger.log(
      JSON.stringify({
        msg: "worker_draining",
        workerId: this.ctx.identity.workerId,
        activeJobs: this.ctx.currentJobCount,
      }),
    );

    if (this.ctx.dbId) {
      await this.prisma.worker.update({
        where: { id: this.ctx.dbId },
        data: { status: "DRAINING" },
      });
    }

    const deadline = Date.now() + this.env.shutdownGraceMs;
    while (this.ctx.currentJobCount > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }

    this.heartbeat.stop();

    if (this.ctx.dbId) {
      await this.prisma.worker.update({
        where: { id: this.ctx.dbId },
        data: {
          status: "OFFLINE",
          stoppedAt: new Date(),
          currentJobCount: 0,
        },
      });
      void this.realtime.workerUpdated({
        workerId: this.ctx.identity.workerId,
        status: "OFFLINE",
      });
    }

    this.logger.log(
      JSON.stringify({
        msg: "worker_offline",
        workerId: this.ctx.identity.workerId,
        remainingJobs: this.ctx.currentJobCount,
      }),
    );
  }
}
