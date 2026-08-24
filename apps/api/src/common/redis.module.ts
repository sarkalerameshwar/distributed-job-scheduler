import { Global, Module } from "@nestjs/common";
import { RedisService } from "./redis.service";
import { DistributedLockService } from "./distributed-lock.service";
import { RateLimitService } from "./rate-limit/rate-limit.service";
import { RateLimitGuard } from "./rate-limit/rate-limit.guard";

@Global()
@Module({
  providers: [RedisService, RateLimitService, RateLimitGuard, DistributedLockService],
  exports: [RedisService, RateLimitService, RateLimitGuard, DistributedLockService],
})
export class RedisModule {}
