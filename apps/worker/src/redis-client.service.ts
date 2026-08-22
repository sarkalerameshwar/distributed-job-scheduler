import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";
import { EnvService } from "./config/env.service";

@Injectable()
export class RedisClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisClientService.name);
  readonly client: Redis;

  constructor(env: EnvService) {
    this.client = new Redis({
      host: env.redisHost,
      port: env.redisPort,
      password: env.redisPassword,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.log("Worker connected to Redis");
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}
