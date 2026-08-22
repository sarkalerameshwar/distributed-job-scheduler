import { RetryService } from "./retry.service";

describe("RetryService", () => {
  const retry = new RetryService();

  it("delegates FIXED/LINEAR/EXPONENTIAL to shared calculator", () => {
    expect(
      retry.calculateDelay({
        strategy: "FIXED",
        attempt: 2,
        initialDelayMs: 5_000,
        maxDelayMs: 60_000,
        multiplier: 2,
      }),
    ).toBe(5_000);
    expect(
      retry.calculateDelay({
        strategy: "LINEAR",
        attempt: 3,
        initialDelayMs: 2_000,
        maxDelayMs: 30_000,
        multiplier: 1,
      }),
    ).toBe(6_000);
    expect(
      retry.calculateDelay({
        strategy: "EXPONENTIAL",
        attempt: 4,
        initialDelayMs: 1_000,
        maxDelayMs: 60_000,
        multiplier: 2,
      }),
    ).toBe(8_000);
  });
});
