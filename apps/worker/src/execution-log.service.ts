import { Injectable } from "@nestjs/common";
import type { LogLevel, Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { WorkerContext } from "./worker-context";

/**
 * Persists structured job logs tied to executions.
 * Job status is a cache; audit trail lives in job_executions + job_logs.
 */
@Injectable()
export class ExecutionLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: WorkerContext,
  ) {}

  async write(input: {
    jobId: string;
    executionId: string;
    level: LogLevel;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.jobLog.create({
      data: {
        jobId: input.jobId,
        executionId: input.executionId,
        workerId: this.ctx.dbId,
        level: input.level,
        message: input.message.slice(0, 2048),
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
