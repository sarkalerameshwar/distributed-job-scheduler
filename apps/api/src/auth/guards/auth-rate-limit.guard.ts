import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AppError } from "../../common/errors/app-error";
import { RedisService } from "../../common/redis.service";

const WINDOW_SECONDS = 60;
const LIMITS: Record<string, number> = {
  "/api/v1/auth/register": 5,
  "/api/v1/auth/login": 8,
  "/api/v1/auth/refresh": 20,
};

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === "test") {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path;
    const limit = LIMITS[path];
    if (!limit) {
      return true;
    }

    const ip = request.ip ?? request.socket.remoteAddress ?? "unknown";
    const key = `rl:auth:${path}:${ip}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, WINDOW_SECONDS);
    }
    if (count > limit) {
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        "RATE_LIMIT_EXCEEDED",
        "Too many authentication attempts. Try again shortly.",
        { retryAfterSeconds: WINDOW_SECONDS },
      );
    }
    return true;
  }
}
