import { Injectable } from "@nestjs/common";
import { hostname } from "os";
import { EnvService } from "./config/env.service";

/**
 * Shared mutable worker runtime state to avoid Nest circular DI.
 */
@Injectable()
export class WorkerContext {
  readonly identity: {
    workerId: string;
    hostname: string;
    processId: number;
    version: string;
  };

  /** Prisma Worker.id (cuid PK), set after registration. */
  dbId: string | null = null;
  draining = false;
  readonly activeJobIds = new Set<string>();

  constructor(env: EnvService) {
    this.identity = {
      workerId: process.env.WORKER_ID ?? `worker-${hostname()}-${process.pid}`,
      hostname: hostname(),
      processId: process.pid,
      version: env.version,
    };
  }

  get currentJobCount(): number {
    return this.activeJobIds.size;
  }
}
