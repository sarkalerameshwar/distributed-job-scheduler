export type RetryDelayInput = {
  strategy: "FIXED" | "LINEAR" | "EXPONENTIAL";
  /** 1-based attempt that just failed (delay before the next attempt). */
  attempt: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  /**
   * Optional jitter in [0, 1]. `0` keeps the deterministic delay.
   * `1` applies full jitter: `delay * U(0,1)` (still capped at maxDelayMs).
   */
  jitterRatio?: number;
  /** Injected RNG for deterministic tests. Defaults to Math.random. */
  random?: () => number;
};

/**
 * Retry delay calculation (Phase 9).
 *
 * FIXED:       delay = initialDelay
 * LINEAR:      delay = initialDelay * attempt
 * EXPONENTIAL: delay = initialDelay * multiplier^(attempt - 1)
 *
 * Always floored to an integer and capped at maxDelayMs.
 */
export function calculateRetryDelay(input: RetryDelayInput): number {
  const attempt = Math.max(1, Math.floor(input.attempt));
  const initial = Math.max(0, input.initialDelayMs);
  const maxDelay = Math.max(0, input.maxDelayMs);
  const multiplier = Number.isFinite(input.multiplier) && input.multiplier > 0 ? input.multiplier : 2;

  let delay: number;
  switch (input.strategy) {
    case "FIXED":
      delay = initial;
      break;
    case "LINEAR":
      delay = initial * attempt;
      break;
    case "EXPONENTIAL":
      delay = initial * Math.pow(multiplier, attempt - 1);
      break;
    default:
      delay = initial;
  }

  if (!Number.isFinite(delay) || delay < 0) {
    delay = 0;
  }

  const jitterRatio = Math.min(1, Math.max(0, input.jitterRatio ?? 0));
  if (jitterRatio > 0) {
    const random = input.random ?? Math.random;
    // Decorrelated-style blend: keep (1-r)*delay base, add r*delay*U(0,1)
    delay = delay * (1 - jitterRatio) + delay * jitterRatio * random();
  }

  return Math.min(Math.max(0, Math.floor(delay)), maxDelay);
}

export type RetryScheduleEntry = {
  /** Attempt that just failed (1-based). */
  afterAttempt: number;
  /** Next attempt number that will run after this delay. */
  nextAttempt: number;
  delayMs: number;
};

/** Preview the backoff schedule for attempts 1..maxAttempts-1 (no delay after the final attempt). */
export function buildRetrySchedule(input: {
  strategy: "FIXED" | "LINEAR" | "EXPONENTIAL";
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitterRatio?: number;
}): RetryScheduleEntry[] {
  const maxAttempts = Math.max(1, Math.floor(input.maxAttempts));
  const entries: RetryScheduleEntry[] = [];
  for (let attempt = 1; attempt < maxAttempts; attempt++) {
    entries.push({
      afterAttempt: attempt,
      nextAttempt: attempt + 1,
      delayMs: calculateRetryDelay({
        strategy: input.strategy,
        attempt,
        initialDelayMs: input.initialDelayMs,
        maxDelayMs: input.maxDelayMs,
        multiplier: input.multiplier,
        jitterRatio: input.jitterRatio ?? 0,
        // Deterministic preview — no random jitter in schedules.
        random: () => 0.5,
      }),
    });
  }
  return entries;
}
