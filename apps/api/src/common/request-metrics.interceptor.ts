import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import type { Request, Response } from "express";
import { MetricsService } from "../metrics/metrics.service";

@Injectable()
export class RequestMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { requestId?: string }>();
    const response = http.getResponse<Response>();
    const requestId = (request.headers["x-request-id"] as string | undefined) ?? randomUUID();
    request.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    const started = Date.now();

    // Prefer route template over raw URL to keep cardinality bounded.
    const route =
      (request.route as { path?: string } | undefined)?.path ??
      request.path ??
      "unknown";

    return next.handle().pipe(
      tap({
        next: () => this.record(request, response, route, started),
        error: () => this.record(request, response, route, started),
      }),
    );
  }

  private record(
    request: Request,
    response: Response,
    route: string,
    started: number,
  ): void {
    const duration = Date.now() - started;
    const status = String(response.statusCode || 500);
    const method = request.method;
    this.metrics.inc("djs_http_requests_total", { method, route, status });
    this.metrics.observeMs("djs_http_request_duration", { method, route }, duration);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        msg: "http_request",
        requestId: (request as Request & { requestId?: string }).requestId,
        method,
        path: request.originalUrl,
        route,
        status: response.statusCode,
        durationMs: duration,
      }),
    );
  }
}
