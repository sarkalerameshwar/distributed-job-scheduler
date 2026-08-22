import { canTransition, isCancellable, isManuallyRetryable } from "./job-state-machine";
import type { JobStatus } from "@djs/shared-types";

describe("job state machine", () => {
  it("allows claim and cancel from QUEUED", () => {
    expect(canTransition("QUEUED", "CLAIMED")).toBe(true);
    expect(canTransition("QUEUED", "CANCELLED")).toBe(true);
    expect(canTransition("QUEUED", "COMPLETED")).toBe(false);
  });

  it("blocks arbitrary jumps from COMPLETED", () => {
    expect(canTransition("COMPLETED", "QUEUED")).toBe(false);
    expect(isCancellable("COMPLETED")).toBe(false);
  });

  it("allows manual retry from FAILED and DLQ", () => {
    expect(isManuallyRetryable("FAILED")).toBe(true);
    expect(isManuallyRetryable("DLQ")).toBe(true);
    expect(canTransition("DLQ", "QUEUED")).toBe(true);
  });

  it("allows cancelling RUNNING attempts", () => {
    expect(isCancellable("RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "CANCELLED")).toBe(true);
  });

  it("covers the worker-owned happy path", () => {
    expect(canTransition("CLAIMED", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "COMPLETED")).toBe(true);
    expect(canTransition("RUNNING", "FAILED")).toBe(true);
    expect(canTransition("FAILED", "RETRYING")).toBe(true);
    expect(canTransition("FAILED", "DLQ")).toBe(true);
    expect(canTransition("RETRYING", "QUEUED")).toBe(true);
  });

  it("covers schedule promotion and cancel edges", () => {
    expect(canTransition("SCHEDULED", "QUEUED")).toBe(true);
    expect(canTransition("SCHEDULED", "CANCELLED")).toBe(true);
    expect(isCancellable("SCHEDULED")).toBe(true);
    expect(isCancellable("CLAIMED")).toBe(true);
    expect(isCancellable("RETRYING")).toBe(true);
    expect(isManuallyRetryable("CANCELLED")).toBe(true);
    expect(isManuallyRetryable("QUEUED")).toBe(false);
  });

  it("rejects illegal transitions for every terminal-ish status", () => {
    const forbidden: Array<[JobStatus, JobStatus]> = [
      ["COMPLETED", "FAILED"],
      ["CANCELLED", "RUNNING"],
      ["DLQ", "RUNNING"],
      ["QUEUED", "RUNNING"],
      ["CLAIMED", "COMPLETED"],
    ];
    for (const [from, to] of forbidden) {
      expect(canTransition(from, to)).toBe(false);
    }
  });
});
