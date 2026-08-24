import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis.service";

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Fixed-window counter. Returns remaining allowance after this hit,
   * or throws nothing — callers check `allowed`.
   */
  async hit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; count: number; retryAfterSeconds: number }> {
    if (process.env.NODE_ENV === "test") {
      return { allowed: true, count: 0, retryAfterSeconds: 0 };
    }
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, windowSeconds);
    }
    return {
      allowed: count <= limit,
      count,
      retryAfterSeconds: windowSeconds,
    };
  }
}
