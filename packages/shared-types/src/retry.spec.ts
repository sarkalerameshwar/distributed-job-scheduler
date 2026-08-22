import { calculateRetryDelay, buildRetrySchedule } from "./retry";

describe("calculateRetryDelay", () => {
  it("computes FIXED delay", () => {
    expect(
      calculateRetryDelay({
        strategy: "FIXED",
        attempt: 2,
        initialDelayMs: 5_000,
        maxDelayMs: 60_000,
        multiplier: 2,
      }),
    ).toBe(5_000);
  });

  it("computes LINEAR delay", () => {
    expect(
      calculateRetryDelay({
        strategy: "LINEAR",
        attempt: 3,
        initialDelayMs: 2_000,
        maxDelayMs: 30_000,
        multiplier: 1,
      }),
    ).toBe(6_000);
  });

  it("computes EXPONENTIAL delay and caps at max", () => {
    expect(
      calculateRetryDelay({
        strategy: "EXPONENTIAL",
        attempt: 1,
        initialDelayMs: 1_000,
        maxDelayMs: 60_000,
        multiplier: 2,
      }),
    ).toBe(1_000);
    expect(
      calculateRetryDelay({
        strategy: "EXPONENTIAL",
        attempt: 4,
        initialDelayMs: 1_000,
        maxDelayMs: 60_000,
        multiplier: 2,
      }),
    ).toBe(8_000);
    expect(
      calculateRetryDelay({
        strategy: "EXPONENTIAL",
        attempt: 20,
        initialDelayMs: 1_000,
        maxDelayMs: 10_000,
        multiplier: 2,
      }),
    ).toBe(10_000);
  });

  it("applies full jitter when jitterRatio=1", () => {
    expect(
      calculateRetryDelay({
        strategy: "FIXED",
        attempt: 1,
        initialDelayMs: 1_000,
        maxDelayMs: 60_000,
        multiplier: 2,
        jitterRatio: 1,
        random: () => 0.25,
      }),
    ).toBe(250);
  });

  it("buildRetrySchedule previews delays before the final attempt", () => {
    const schedule = buildRetrySchedule({
      strategy: "EXPONENTIAL",
      maxAttempts: 4,
      initialDelayMs: 1_000,
      maxDelayMs: 60_000,
      multiplier: 2,
    });
    expect(schedule).toEqual([
      { afterAttempt: 1, nextAttempt: 2, delayMs: 1_000 },
      { afterAttempt: 2, nextAttempt: 3, delayMs: 2_000 },
      { afterAttempt: 3, nextAttempt: 4, delayMs: 4_000 },
    ]);
  });
});
