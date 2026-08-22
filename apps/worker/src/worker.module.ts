import { Module } from "@nestjs/common";
import { EnvModule } from "./config/env.module";
import { PrismaService } from "./prisma.service";
import { RedisClientService } from "./redis-client.service";
import { WorkerContext } from "./worker-context";
import { WorkerService } from "./worker.service";
import { HeartbeatService } from "./heartbeat.service";
import { ShutdownService } from "./shutdown.service";
import { JobExecutor } from "./job-executor";
import { RetryService } from "./retry.service";
import { JobClaimService } from "./job-claim.service";
import { JobProcessorService } from "./job-processor.service";
import { ExecutionLogService } from "./execution-log.service";
import { StaleRecoveryService } from "./stale-recovery.service";
import { RealtimePublisher } from "./realtime.publisher";
import { WorkerMetricsService } from "./worker-metrics.service";
import { WorkerHealthController } from "./health.controller";

@Module({
  imports: [EnvModule],
  controllers: [WorkerHealthController],
  providers: [
    PrismaService,
    RedisClientService,
    WorkerContext,
    WorkerMetricsService,
    JobExecutor,
    RetryService,
    RealtimePublisher,
    JobClaimService,
    ExecutionLogService,
    JobProcessorService,
    StaleRecoveryService,
    HeartbeatService,
    WorkerService,
    ShutdownService,
  ],
})
export class WorkerModule {}
