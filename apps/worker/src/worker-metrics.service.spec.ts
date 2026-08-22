import { WorkerMetricsService } from "./worker-metrics.service";

describe("WorkerMetricsService", () => {
  it("renders prometheus counters after increments", () => {
    const metrics = new WorkerMetricsService();
    metrics.incClaim();
    metrics.incClaim();
    metrics.incCompletion();
    metrics.incFailure();
    metrics.incDlq();
    metrics.incRecovery(3);
    metrics.incHeartbeat();
    metrics.incRealtimePublish();

    const text = metrics.render(2, false, 'worker-a"x');
    expect(text).toContain("djs_worker_up{worker_id=\"worker-a\\\"x\"} 1");
    expect(text).toContain("djs_worker_active_jobs 2");
    expect(text).toContain("djs_worker_claims_total 2");
    expect(text).toContain("djs_worker_completions_total 1");
    expect(text).toContain("djs_worker_failures_total 1");
    expect(text).toContain("djs_worker_dlq_moves_total 1");
    expect(text).toContain("djs_worker_recoveries_total 3");
    expect(text).toContain("djs_worker_heartbeats_total 1");
    expect(text).toContain("djs_worker_realtime_publishes_total 1");
  });

  it("marks worker down while draining", () => {
    const metrics = new WorkerMetricsService();
    const text = metrics.render(0, true, "w1");
    expect(text).toContain('djs_worker_up{worker_id="w1"} 0');
  });
});
