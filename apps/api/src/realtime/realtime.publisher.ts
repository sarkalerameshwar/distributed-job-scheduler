import { Injectable, Logger } from "@nestjs/common";
import { REALTIME_REDIS_CHANNEL, type RealtimeEvent, type RealtimeEventType } from "@djs/shared-types";
import { RedisService } from "../common/redis.service";
import { MetricsService } from "../metrics/metrics.service";

@Injectable()
export class RealtimePublisher {
  private readonly logger = new Logger(RealtimePublisher.name);

  constructor(
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
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
      this.metrics.inc("djs_realtime_events_published_total", { type: input.type });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          msg: "realtime_publish_failed",
          type: input.type,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
      this.metrics.inc("djs_realtime_publish_errors_total", { type: input.type });
    }
  }

  async jobUpdated(organizationId: string, payload: Record<string, unknown>): Promise<void> {
    const status = typeof payload.status === "string" ? payload.status : "unknown";
    this.metrics.inc("djs_job_events_total", { status });
    await this.publish({ type: "job.updated", organizationId, payload });
    await this.publish({ type: "dashboard.refresh", organizationId, payload: { reason: "job.updated" } });
  }

  async queueUpdated(organizationId: string, payload: Record<string, unknown>): Promise<void> {
    await this.publish({ type: "queue.updated", organizationId, payload });
    await this.publish({ type: "dashboard.refresh", organizationId, payload: { reason: "queue.updated" } });
  }

  async dlqUpdated(organizationId: string, payload: Record<string, unknown>): Promise<void> {
    this.metrics.inc("djs_dlq_events_total", {});
    await this.publish({ type: "dlq.updated", organizationId, payload });
    await this.publish({ type: "dashboard.refresh", organizationId, payload: { reason: "dlq.updated" } });
  }

  async workerUpdated(payload: Record<string, unknown>): Promise<void> {
    await this.publish({ type: "worker.updated", organizationId: null, payload });
  }
}
