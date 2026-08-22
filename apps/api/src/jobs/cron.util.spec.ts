import { isValidCronExpression, getNextCronRun } from "./cron.util";

describe("cron.util re-exports", () => {
  it("validates and computes next run", () => {
    expect(isValidCronExpression("0 9 * * *")).toBe(true);
    const next = getNextCronRun("0 9 * * *", {
      from: new Date("2026-08-22T08:00:00.000Z"),
      timezone: "UTC",
    });
    expect(next.toISOString()).toBe("2026-08-22T09:00:00.000Z");
  });
});
