import { MetricsService } from "./metrics.service";

describe("MetricsService", () => {
  it("increments labeled counters and renders prometheus text", async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue(1),
      job: { groupBy: jest.fn().mockResolvedValue([{ status: "QUEUED", _count: { _all: 4 } }]) },
      worker: {
        groupBy: jest.fn().mockResolvedValue([
          { status: "ONLINE", _count: { _all: 2 } },
          { status: "FAILED", _count: { _all: 1 } },
        ]),
      },
      deadLetterJob: { count: jest.fn().mockResolvedValue(3) },
    };
    const redis = { ping: jest.fn().mockResolvedValue("PONG") };
    const metrics = new MetricsService(prisma as never, redis as never);

    metrics.inc("djs_http_requests_total", { method: "GET", route: "/health", status: "200" });
    metrics.inc("djs_http_requests_total", { method: "GET", route: "/health", status: "200" });
    metrics.observeMs("djs_http_request_duration", { method: "GET", route: "/health" }, 12);

    const text = await metrics.renderPrometheus();
    expect(text).toContain("djs_process_up 1");
    expect(text).toContain("djs_mysql_up 1");
    expect(text).toContain("djs_redis_up 1");
    expect(text).toContain('djs_jobs{status="QUEUED"} 4');
    expect(text).toContain("djs_queue_depth 4");
    expect(text).toContain("djs_dlq_open 3");
    expect(text).toContain('djs_workers{status="ONLINE"} 2');
    expect(text).toContain('djs_http_requests_total{method="GET",route="/health",status="200"} 2');
    expect(text).toContain("djs_http_request_duration_ms_count");

    const snap = await metrics.getSnapshot();
    expect(snap.snapshot.httpRequestsTotal).toBe(2);
    expect(snap.snapshot.workersOnline).toBe(2);
    expect(snap.snapshot.openDlq).toBe(3);
  });
});
