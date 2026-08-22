import { Injectable } from "@nestjs/common";
import { calculateRetryDelay, type RetryStrategy } from "@djs/shared-types";

/**
 * Nest wrapper around the shared retry delay calculator (Phase 9).
 */
@Injectable()
export class RetryService {
  calculateDelay(input: {
    strategy: RetryStrategy;
    attempt: number;
    initialDelayMs: number;
    maxDelayMs: number;
    multiplier: number;
    jitterRatio?: number;
    random?: () => number;
  }): number {
    return calculateRetryDelay(input);
  }
}
