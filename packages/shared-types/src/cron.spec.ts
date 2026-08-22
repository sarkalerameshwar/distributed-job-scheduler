import { getNextCronRun, getNextCronRuns, isValidCronExpression, isValidIanaTimezone } from "./cron";

describe("cron helpers", () => {
  it("validates 5-field expressions", () => {
    expect(isValidCronExpression("0 9 * * *")).toBe(true);
    expect(isValidCronExpression("*/5 * * * *")).toBe(true);
    expect(isValidCronExpression("0 9 * *")).toBe(false);
    expect(isValidCronExpression("not a cron")).toBe(false);
  });

  it("rejects invalid timezones", () => {
    expect(isValidIanaTimezone("UTC")).toBe(true);
    expect(isValidIanaTimezone("America/New_York")).toBe(true);
    expect(isValidIanaTimezone("Not/AZone")).toBe(false);
  });

  it("computes next run for */5 in UTC", () => {
    const from = new Date("2026-08-22T12:00:00.000Z");
    expect(getNextCronRun("*/5 * * * *", { from, timezone: "UTC" }).toISOString()).toBe(
      "2026-08-22T12:05:00.000Z",
    );
  });

  it("previews multiple runs", () => {
    const from = new Date("2026-08-22T12:00:00.000Z");
    const runs = getNextCronRuns("0 * * * *", 3, { from, timezone: "UTC" });
    expect(runs.map((d) => d.toISOString())).toEqual([
      "2026-08-22T13:00:00.000Z",
      "2026-08-22T14:00:00.000Z",
      "2026-08-22T15:00:00.000Z",
    ]);
  });
});
