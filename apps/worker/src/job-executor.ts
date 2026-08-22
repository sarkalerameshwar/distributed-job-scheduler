import { Injectable, Logger } from "@nestjs/common";
import { resolveTask } from "./task-registry";

export type ExecutionOutcome =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; timedOut: boolean; errorCode: string; errorMessage: string; errorStack?: string };

@Injectable()
export class JobExecutor {
  private readonly logger = new Logger(JobExecutor.name);

  async execute(taskType: string, payload: unknown, timeoutMs: number): Promise<ExecutionOutcome> {
    const handler = resolveTask(taskType);
    if (!handler) {
      return {
        ok: false,
        timedOut: false,
        errorCode: "UNKNOWN_TASK_TYPE",
        errorMessage: `Unknown task type: ${taskType}`,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result =
        (await handler((payload ?? {}) as Record<string, unknown>, controller.signal)) ?? {};
      return { ok: true, result: result as Record<string, unknown> };
    } catch (error) {
      const timedOut = controller.signal.aborted;
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(
        JSON.stringify({
          msg: "task_failed",
          taskType,
          timedOut,
          error: err.message,
        }),
      );
      return {
        ok: false,
        timedOut,
        errorCode: timedOut ? "TIMEOUT" : ((error as { code?: string }).code ?? "TASK_FAILED"),
        errorMessage: timedOut ? `Execution exceeded timeout of ${timeoutMs}ms` : err.message,
        errorStack: timedOut ? undefined : err.stack,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
