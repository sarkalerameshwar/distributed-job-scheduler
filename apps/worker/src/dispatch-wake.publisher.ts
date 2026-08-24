import { Injectable, Logger } from "@nestjs/common";
import { DISPATCH_WAKE_CHANNEL, type DispatchWakeEvent } from "@djs/shared-types";
import { RedisClientService } from "./redis-client.service";

/**
 * Publish wake events so sibling workers can claim sooner after promote/retry.
 */
@Injectable()
export class DispatchWakePublisher {
  private readonly logger = new Logger(DispatchWakePublisher.name);

  constructor(private readonly redis: RedisClientService) {}

  async wake(
    input: Omit<DispatchWakeEvent, "at"> & { at?: string },
  ): Promise<void> {
    const event: DispatchWakeEvent = {
      at: input.at ?? new Date().toISOString(),
      reason: input.reason,
      queueId: input.queueId,
      jobId: input.jobId,
      count: input.count,
    };
    try {
      await this.redis.client.publish(DISPATCH_WAKE_CHANNEL, JSON.stringify(event));
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          msg: "dispatch_wake_failed",
          reason: event.reason,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}
