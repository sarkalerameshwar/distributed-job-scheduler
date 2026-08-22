import { Injectable, Logger } from "@nestjs/common";
import { APP_NAME, APP_VERSION, type SystemMetricsSnapshot } from "@djs/shared-types";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../common/redis.service";

const startedAt = Date.now();

type CounterMap = Map<string, number>;

/**
 * In-process counters + on-scrape DB gauges for Prometheus text exposition.
 * Avoids a heavy metrics client while remaining scrape-compatible.
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly counters: CounterMap = new Map();
  private readonly histograms: Map<string, number[]> = new Map();
  private cache: { at: number; snapshot: SystemMetricsSnapshot; mysqlUp: number; redisUp: number } | null =
    null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  inc(name: string, labels: Record<string, string> = {}, value = 1): void {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  observeMs(name: string, labels: Record<string, string>, durationMs: number): void {
    const key = this.key(name, labels);
    const bucket = this.histograms.get(key) ?? [];
    bucket.push(durationMs);
    // Cap memory — keep a rolling window for avg/sum export.
    if (bucket.length > 500) {
      bucket.splice(0, bucket.length - 500);
    }
    this.histograms.set(key, bucket);
  }

  async renderPrometheus(): Promise<string> {
    const snap = await this.getSnapshot(true);
    const lines: string[] = [];

    lines.push("# HELP djs_process_up 1 if the API process is running");
    lines.push("# TYPE djs_process_up gauge");
    lines.push("djs_process_up 1");

    lines.push("# HELP djs_process_uptime_seconds Process uptime");
    lines.push("# TYPE djs_process_uptime_seconds gauge");
    lines.push(`djs_process_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`);

    lines.push("# HELP djs_build_info Build metadata");
    lines.push("# TYPE djs_build_info gauge");
    lines.push(`djs_build_info{service="${APP_NAME}",version="${APP_VERSION}"} 1`);

    lines.push("# HELP djs_mysql_up 1 if MySQL ping succeeded on last scrape");
    lines.push("# TYPE djs_mysql_up gauge");
    lines.push(`djs_mysql_up ${snap.mysqlUp}`);

    lines.push("# HELP djs_redis_up 1 if Redis ping succeeded on last scrape");
    lines.push("# TYPE djs_redis_up gauge");
    lines.push(`djs_redis_up ${snap.redisUp}`);

    lines.push("# HELP djs_jobs Job rows by status");
    lines.push("# TYPE djs_jobs gauge");
    for (const [status, count] of Object.entries(snap.snapshot.jobsByStatus)) {
      lines.push(`djs_jobs{status="${escapeLabel(status)}"} ${count}`);
    }

    lines.push("# HELP djs_queue_depth Queued + scheduled + retrying jobs");
    lines.push("# TYPE djs_queue_depth gauge");
    lines.push(`djs_queue_depth ${snap.snapshot.queueDepth}`);

    lines.push("# HELP djs_jobs_running Claimed + running jobs");
    lines.push("# TYPE djs_jobs_running gauge");
    lines.push(`djs_jobs_running ${snap.snapshot.jobsRunning}`);

    lines.push("# HELP djs_dlq_open Unresolved dead-letter entries");
    lines.push("# TYPE djs_dlq_open gauge");
    lines.push(`djs_dlq_open ${snap.snapshot.openDlq}`);

    lines.push("# HELP djs_workers Workers by status");
    lines.push("# TYPE djs_workers gauge");
    lines.push(`djs_workers{status="ONLINE"} ${snap.snapshot.workersOnline}`);
    lines.push(`djs_workers{status="FAILED"} ${snap.snapshot.workersFailed}`);
    lines.push(`djs_workers{status="TOTAL"} ${snap.snapshot.workersTotal}`);

    const counterNames = new Set<string>();
    for (const [key, value] of this.counters) {
      const { name, labelStr } = this.parseKey(key);
      if (!name.startsWith("djs_")) continue;
      if (!counterNames.has(name)) {
        lines.push(`# HELP ${name} Counter`);
        lines.push(`# TYPE ${name} counter`);
        counterNames.add(name);
      }
      lines.push(`${name}${labelStr} ${value}`);
    }

    const histNames = new Set<string>();
    for (const [key, samples] of this.histograms) {
      const { name, labelStr } = this.parseKey(key);
      if (!samples.length) continue;
      const sum = samples.reduce((a, b) => a + b, 0);
      const count = samples.length;
      const base = `${name}_ms`;
      if (!histNames.has(base)) {
        lines.push(`# HELP ${base} Request duration milliseconds`);
        lines.push(`# TYPE ${base} summary`);
        histNames.add(base);
      }
      lines.push(`${base}_sum${labelStr} ${sum}`);
      lines.push(`${base}_count${labelStr} ${count}`);
    }

    lines.push("");
    return lines.join("\n");
  }

  async getSnapshot(forceDeps = false): Promise<{
    snapshot: SystemMetricsSnapshot;
    mysqlUp: number;
    redisUp: number;
  }> {
    const now = Date.now();
    if (!forceDeps && this.cache && now - this.cache.at < 2_000) {
      return this.cache;
    }

    let mysqlUp = 0;
    let redisUp = 0;
    try {
      await this.prisma.$queryRawUnsafe("SELECT 1");
      mysqlUp = 1;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          msg: "metrics_mysql_check_failed",
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
    try {
      const pong = await this.redis.ping();
      redisUp = pong === "PONG" ? 1 : 0;
    } catch {
      redisUp = 0;
    }

    const [jobGroups, workerGroups, openDlq] = await Promise.all([
      this.prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.worker.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.deadLetterJob.count({ where: { resolvedAt: null } }),
    ]);

    const jobsByStatus: Record<string, number> = {};
    for (const row of jobGroups) {
      jobsByStatus[row.status] = row._count._all;
    }

    let workersOnline = 0;
    let workersFailed = 0;
    let workersTotal = 0;
    for (const row of workerGroups) {
      workersTotal += row._count._all;
      if (row.status === "ONLINE") workersOnline = row._count._all;
      if (row.status === "FAILED") workersFailed = row._count._all;
    }

    const queueDepth =
      (jobsByStatus.QUEUED ?? 0) + (jobsByStatus.SCHEDULED ?? 0) + (jobsByStatus.RETRYING ?? 0);
    const jobsRunning = (jobsByStatus.CLAIMED ?? 0) + (jobsByStatus.RUNNING ?? 0);

    let httpRequestsTotal = 0;
    for (const [key, value] of this.counters) {
      if (key.startsWith("djs_http_requests_total|")) {
        httpRequestsTotal += value;
      }
    }

    const snapshot: SystemMetricsSnapshot = {
      workersOnline,
      workersFailed,
      workersTotal,
      jobsByStatus,
      queueDepth,
      jobsRunning,
      openDlq,
      httpRequestsTotal,
    };

    this.cache = { at: now, snapshot, mysqlUp, redisUp };
    return this.cache;
  }

  private key(name: string, labels: Record<string, string>): string {
    const parts = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`);
    return parts.length ? `${name}|${parts.join(",")}` : name;
  }

  private parseKey(key: string): { name: string; labelStr: string } {
    const [name, rest] = key.split("|");
    if (!rest) {
      return { name: name!, labelStr: "" };
    }
    const labels = rest
      .split(",")
      .map((pair) => {
        const [k, v] = pair.split("=");
        return `${k}="${escapeLabel(v ?? "")}"`;
      })
      .join(",");
    return { name: name!, labelStr: `{${labels}}` };
  }
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}
