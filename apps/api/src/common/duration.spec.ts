import { parseDurationMs } from "./duration";

describe("parseDurationMs", () => {
  it("parses minutes and days", () => {
    expect(parseDurationMs("15m")).toBe(15 * 60_000);
    expect(parseDurationMs("7d")).toBe(7 * 86_400_000);
  });

  it("rejects unknown formats", () => {
    expect(() => parseDurationMs("15 minutes")).toThrow(/Invalid duration/);
  });
});
