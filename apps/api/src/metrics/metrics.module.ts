import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { MetricsService } from "./metrics.service";
import { RequestMetricsInterceptor } from "../common/request-metrics.interceptor";

@Global()
@Module({
  providers: [
    MetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestMetricsInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
