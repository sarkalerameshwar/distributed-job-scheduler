import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AppError } from "../errors/app-error";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { RateLimitService } from "./rate-limit.service";
import { RATE_LIMIT_KEY, type RateLimitOptions } from "./rate-limit.decorator";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const scope = options.scope ?? "user";
    const identity =
      scope === "ip"
        ? (request.ip ?? request.socket.remoteAddress ?? "unknown")
        : (request.user?.id ?? request.ip ?? "anon");
    const windowSeconds = options.windowSeconds ?? 60;
    const key = `rl:${options.name}:${identity}`;
    const result = await this.rateLimit.hit(key, options.limit, windowSeconds);
    if (!result.allowed) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT_EXCEEDED", "Rate limit exceeded", {
        name: options.name,
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
    return true;
  }
}
