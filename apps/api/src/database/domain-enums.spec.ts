import { JOB_STATUSES, RETRY_STRATEGIES, TASK_TYPES } from "@djs/shared-types";

describe("domain enumerations", () => {
  it("covers the job lifecycle statuses", () => {
    expect(JOB_STATUSES).toEqual(
      expect.arrayContaining(["QUEUED", "CLAIMED", "RUNNING", "COMPLETED", "FAILED", "RETRYING", "DLQ"]),
    );
  });

  it("covers retry strategies and the task registry", () => {
    expect(RETRY_STRATEGIES).toEqual(["FIXED", "LINEAR", "EXPONENTIAL"]);
    expect(TASK_TYPES).toContain("send_email");
    expect(TASK_TYPES).toContain("test_failure");
  });
});
