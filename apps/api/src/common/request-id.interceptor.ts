import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import type { Request, Response } from "express";

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { requestId?: string }>();
    const response = http.getResponse<Response>();
    const requestId = (request.headers["x-request-id"] as string | undefined) ?? randomUUID();
    request.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    const started = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - started;
        // Structured log line — expanded to pino in the observability phase.
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            msg: "http_request",
            requestId,
            method: request.method,
            path: request.originalUrl,
            status: response.statusCode,
            durationMs: duration,
          }),
        );
      }),
    );
  }
}
