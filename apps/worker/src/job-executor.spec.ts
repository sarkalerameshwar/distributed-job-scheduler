import { JobExecutor } from "./job-executor";

describe("JobExecutor", () => {
  const executor = new JobExecutor();

  it("runs test_success", async () => {
    const outcome = await executor.execute("test_success", {}, 5_000);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result).toEqual({ ok: true });
    }
  });

  it("fails unknown task types safely", async () => {
    const outcome = await executor.execute("not_a_real_task", {}, 5_000);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.errorCode).toBe("UNKNOWN_TASK_TYPE");
    }
  });

  it("captures test_failure", async () => {
    const outcome = await executor.execute("test_failure", {}, 5_000);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.timedOut).toBe(false);
      expect(outcome.errorCode).toBe("TASK_FAILED");
    }
  });

  it("times out test_timeout", async () => {
    const outcome = await executor.execute("test_timeout", {}, 50);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.timedOut).toBe(true);
      expect(outcome.errorCode).toBe("TIMEOUT");
    }
  }, 10_000);
});
