import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

export function requestIdMiddleware(req: Request & { requestId?: string }, res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
