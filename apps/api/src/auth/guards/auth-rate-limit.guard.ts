import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AppError } from "../../common/errors/app-error";
import { RateLimitService } from "../../common/rate-limit/rate-limit.service";

const WINDOW_SECONDS = 60;
const LIMITS: Record<string, number> = {
  "/api/v1/auth/register": 5,
  "/api/v1/auth/login": 8,
  "/api/v1/auth/refresh": 20,
};

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path;
    const limit = LIMITS[path];
    if (!limit) {
      return true;
    }

    const ip = request.ip ?? request.socket.remoteAddress ?? "unknown";
    const result = await this.rateLimit.hit(`rl:auth:${path}:${ip}`, limit, WINDOW_SECONDS);
    if (!result.allowed) {
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        "RATE_LIMIT_EXCEEDED",
        "Too many authentication attempts. Try again shortly.",
        { retryAfterSeconds: result.retryAfterSeconds },
      );
    }
    return true;
  }
}
