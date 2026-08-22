import { HttpException, HttpStatus } from "@nestjs/common";

export type ErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
  requestId: string;
};

export class AppError extends HttpException {
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly clientMessage: string;

  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super({ success: false, error: { code, message, details } }, status);
    this.code = code;
    this.details = details;
    this.clientMessage = message;
  }
}
