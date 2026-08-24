import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";
import { DISPATCH_WAKE_CHANNEL, type DispatchWakeEvent } from "@djs/shared-types";
import { EnvService } from "./config/env.service";
import { WorkerMetricsService } from "./worker-metrics.service";

type WakeHandler = (event: DispatchWakeEvent) => void;

/**
 * Subscribes to Redis dispatch wake channel and invokes a handler (claim tick).
 * Polling remains the reliability fallback when Pub/Sub is missed.
 */
@Injectable()
export class DispatchWakeSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatchWakeSubscriber.name);
  private subscriber?: Redis;
  private handler?: WakeHandler;

  constructor(
    private readonly env: EnvService,
    private readonly metrics: WorkerMetricsService,
  ) {}

  /** Register claim wake callback (set from WorkerService after construction). */
  onWake(handler: WakeHandler): void {
    this.handler = handler;
  }

  async onModuleInit(): Promise<void> {
    this.subscriber = new Redis({
      host: this.env.redisHost,
      port: this.env.redisPort,
      password: this.env.redisPassword,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    this.subscriber.on("message", (_channel: string, raw: string) => {
      let event: DispatchWakeEvent;
      try {
        event = JSON.parse(raw) as DispatchWakeEvent;
      } catch {
        event = { at: new Date().toISOString(), reason: "manual" };
      }
      this.metrics.incDispatchWake();
      this.logger.debug(
        JSON.stringify({
          msg: "dispatch_wake_received",
          reason: event.reason,
          jobId: event.jobId,
          count: event.count,
        }),
      );
      this.handler?.(event);
    });
    await this.subscriber.connect();
    await this.subscriber.subscribe(DISPATCH_WAKE_CHANNEL);
    this.logger.log(`Subscribed to Redis channel ${DISPATCH_WAKE_CHANNEL}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      try {
        await this.subscriber.unsubscribe(DISPATCH_WAKE_CHANNEL);
        await this.subscriber.quit();
      } catch {
        this.subscriber.disconnect();
      }
      this.subscriber = undefined;
    }
  }
}
