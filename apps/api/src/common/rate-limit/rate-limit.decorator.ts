import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_KEY = "rate_limit";

export type RateLimitOptions = {
  /** Logical bucket name (e.g. jobs.retry) */
  name: string;
  /** Max hits per window */
  limit: number;
  /** Window length in seconds */
  windowSeconds?: number;
  /** Scope identity: user id when authenticated, else IP */
  scope?: "user" | "ip";
};

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
