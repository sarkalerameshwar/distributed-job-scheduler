import { Controller, Get, Header } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthService } from "./health.service";

@ApiTags("health")
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("health")
  @ApiOperation({ summary: "Aggregate health (MySQL + Redis + workers) with metrics snapshot" })
  async getHealth() {
    return this.healthService.getHealth();
  }

  @Get("health/live")
  @ApiOperation({ summary: "Liveness — process is running" })
  live() {
    return this.healthService.getLiveness();
  }

  @Get("health/ready")
  @ApiOperation({ summary: "Readiness — MySQL and Redis are reachable" })
  async ready() {
    return this.healthService.getReadiness();
  }

  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  @ApiOperation({ summary: "Prometheus metrics (jobs, workers, HTTP, DLQ)" })
  async metrics(): Promise<string> {
    return this.healthService.getPrometheus();
  }
}
