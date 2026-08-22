import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AppError } from "../../common/errors/app-error";
import { RedisService } from "../../common/redis.service";
import type { AuthenticatedUser } from "../../auth/auth.types";

const WINDOW_SECONDS = 60;
const LIMIT = 60;

@Injectable()
export class JobCreateRateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === "test") {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const identity = request.user?.id ?? request.ip ?? "anon";
    const key = `rl:jobs:create:${identity}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, WINDOW_SECONDS);
    }
    if (count > LIMIT) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT_EXCEEDED", "Job creation rate limit exceeded", {
        retryAfterSeconds: WINDOW_SECONDS,
      });
    }
    return true;
  }
}
