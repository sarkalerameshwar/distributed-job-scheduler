import { Controller, Get, Header } from "@nestjs/common";
import { WorkerService } from "./worker.service";

@Controller()
export class WorkerHealthController {
  constructor(private readonly worker: WorkerService) {}

  @Get("health")
  async health() {
    return this.worker.getHealth();
  }

  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4")
  metrics(): string {
    return this.worker.getPrometheusPlaceholder();
  }
}
