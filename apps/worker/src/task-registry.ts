import type { TaskType } from "@djs/shared-types";

export type TaskHandler = (payload: Record<string, unknown>, signal: AbortSignal) => Promise<Record<string, unknown> | void>;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error("Aborted"), { code: "TIMEOUT" }));
      return;
    }
    const timer = setTimeout(() => resolve(), ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("Aborted"), { code: "TIMEOUT" }));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Controlled task registry — never eval user-supplied code.
 * Unknown task types fail safely in the executor.
 */
export const TASK_REGISTRY: Record<TaskType, TaskHandler> = {
  send_email: async (payload) => ({
    messageId: `msg_${Date.now()}`,
    to: payload.to,
    subject: payload.subject,
  }),
  generate_report: async (payload, signal) => {
    await sleep(50, signal);
    return { report: payload.report ?? "report", rows: 42 };
  },
  send_notification: async (payload) => ({
    delivered: true,
    userId: payload.userId,
    channel: payload.channel,
  }),
  cleanup: async (payload) => ({
    deleted: 0,
    path: payload.path,
  }),
  data_export: async (payload, signal) => {
    await sleep(30, signal);
    return { exportId: `exp_${Date.now()}`, format: payload.format ?? "json" };
  },
  test_success: async () => ({ ok: true }),
  test_failure: async () => {
    throw Object.assign(new Error("test_failure handler always fails"), { code: "TASK_FAILED" });
  },
  test_timeout: async (_payload, signal) => {
    await sleep(120_000, signal);
  },
};

export function resolveTask(taskType: string): TaskHandler | undefined {
  return TASK_REGISTRY[taskType as TaskType];
}
