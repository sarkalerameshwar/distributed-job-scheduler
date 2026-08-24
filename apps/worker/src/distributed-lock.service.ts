import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "crypto";
import { RedisClientService } from "./redis-client.service";

const UNLOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export const STALE_RECOVERY_LOCK_KEY = "djs:lock:stale-recovery";
export const PROMOTE_LOCK_KEY = "djs:lock:promote";

/**
 * Redis SET NX PX lock for cross-worker coordination.
 * Job claim remains MySQL conditional UPDATE; this avoids redundant recovery sweeps.
 */
@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  constructor(private readonly redis: RedisClientService) {}

  async tryAcquire(key: string, ttlMs: number): Promise<string | null> {
    const token = randomBytes(16).toString("hex");
    const result = await this.redis.client.set(key, token, "PX", ttlMs, "NX");
    return result === "OK" ? token : null;
  }

  async release(key: string, token: string): Promise<boolean> {
    const result = await this.redis.client.eval(UNLOCK_LUA, 1, key, token);
    return result === 1;
  }

  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<{ acquired: boolean; result?: T }> {
    const token = await this.tryAcquire(key, ttlMs);
    if (!token) {
      return { acquired: false };
    }
    try {
      const result = await fn();
      return { acquired: true, result };
    } finally {
      try {
        await this.release(key, token);
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            msg: "lock_release_failed",
            key,
            error: error instanceof Error ? error.message : "unknown",
          }),
        );
      }
    }
  }
}
