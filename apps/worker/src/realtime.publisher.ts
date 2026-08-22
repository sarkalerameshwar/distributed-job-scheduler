import { Injectable, Logger } from "@nestjs/common";
import { REALTIME_REDIS_CHANNEL, type RealtimeEvent, type RealtimeEventType } from "@djs/shared-types";
import { RedisClientService } from "./redis-client.service";
import { WorkerMetricsService } from "./worker-metrics.service";

@Injectable()
export class RealtimePublisher {
  private readonly logger = new Logger(RealtimePublisher.name);

  constructor(
    private readonly redis: RedisClientService,
    private readonly metrics: WorkerMetricsService,
  ) {}

  async publish(input: {
    type: RealtimeEventType;
    organizationId: string | null;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const event: RealtimeEvent = {
      type: input.type,
      organizationId: input.organizationId,
      at: new Date().toISOString(),
      payload: input.payload ?? {},
    };
    try {
      await this.redis.client.publish(REALTIME_REDIS_CHANNEL, JSON.stringify(event));
      this.metrics.incRealtimePublish();
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          msg: "realtime_publish_failed",
          type: input.type,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  async jobUpdated(organizationId: string, payload: Record<string, unknown>): Promise<void> {
    await this.publish({ type: "job.updated", organizationId, payload });
    await this.publish({ type: "dashboard.refresh", organizationId, payload: { reason: "job.updated" } });
  }

  async dlqUpdated(organizationId: string, payload: Record<string, unknown>): Promise<void> {
    await this.publish({ type: "dlq.updated", organizationId, payload });
    await this.publish({ type: "dashboard.refresh", organizationId, payload: { reason: "dlq.updated" } });
  }

  async workerUpdated(payload: Record<string, unknown>): Promise<void> {
    await this.publish({ type: "worker.updated", organizationId: null, payload });
  }
}
