import { Prisma } from "@prisma/client";
import { HttpStatus } from "@nestjs/common";
import { AppError } from "./errors/app-error";

export function rethrowUnique(error: unknown, code: string, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new AppError(HttpStatus.CONFLICT, code, message);
  }
  throw error;
}
