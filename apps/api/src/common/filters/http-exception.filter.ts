import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AppError, type ErrorBody } from "../errors/app-error";
import { EnvService } from "../../config/env.service";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly env: EnvService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId ?? (request.headers["x-request-id"] as string | undefined) ?? "unknown";

    const body = this.toBody(exception, requestId);
    const status = this.statusOf(exception);

    if (status >= 500) {
      this.logger.error({
        msg: "unhandled_error",
        requestId,
        error: exception instanceof Error ? exception.message : "unknown",
      });
    }

    response.status(status).json(body);
  }

  private statusOf(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private toBody(exception: unknown, requestId: string): ErrorBody {
    if (exception instanceof AppError) {
      return {
        success: false,
        error: {
          code: exception.code,
          message: exception.clientMessage,
          details: exception.details,
        },
        requestId,
      };
    }

    if (exception instanceof UnauthorizedException) {
      return {
        success: false,
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication required",
          details: {},
        },
        requestId,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (status === HttpStatus.BAD_REQUEST) {
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: this.validationDetails(raw),
          },
          requestId,
        };
      }
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        return {
          success: false,
          error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests", details: {} },
          requestId,
        };
      }
      const message = typeof raw === "string" ? raw : exception.message;
      return {
        success: false,
        error: { code: this.codeForStatus(status), message, details: {} },
        requestId,
      };
    }

    return {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: this.env.isProduction ? "An unexpected error occurred" : this.unsafeMessage(exception),
        details: {},
      },
      requestId,
    };
  }

  private validationDetails(raw: string | object): Record<string, unknown> {
    if (typeof raw === "string") {
      return { message: raw };
    }
    const record = raw as { message?: unknown };
    return { messages: record.message ?? raw };
  }

  private codeForStatus(status: number): string {
    if (status === 403) return "FORBIDDEN";
    if (status === 404) return "NOT_FOUND";
    if (status === 409) return "CONFLICT";
    if (status === 503) return "DEPENDENCY_UNAVAILABLE";
    return "HTTP_ERROR";
  }

  private unsafeMessage(exception: unknown): string {
    return exception instanceof Error ? exception.message : "An unexpected error occurred";
  }
}
