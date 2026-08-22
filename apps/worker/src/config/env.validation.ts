import { IsInt, IsNotEmpty, IsOptional, IsString, Min, MinLength, validateSync } from "class-validator";
import { plainToInstance, Type } from "class-transformer";

export class WorkerEnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  NODE_ENV!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  WORKER_HEALTH_PORT!: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  REDIS_PORT!: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  WORKER_CONCURRENCY!: number;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  HEARTBEAT_INTERVAL_MS!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  HEARTBEAT_TIMEOUT_MS?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  HEARTBEAT_RETENTION_DAYS?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  WORKER_RECOVERY_INTERVAL_MS?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  JOB_DEFAULT_TIMEOUT_MS!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  WORKER_POLL_INTERVAL_MS?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  SHUTDOWN_GRACE_MS?: number;

  @IsOptional()
  @IsString()
  WORKER_VERSION?: string;

  @IsOptional()
  @IsString()
  WORKER_ID?: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;
}

export function validateWorkerEnvironment(config: Record<string, unknown>): WorkerEnvironmentVariables {
  const validated = plainToInstance(WorkerEnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(", "))
      .join("; ");
    throw new Error(`Invalid worker environment configuration: ${messages}`);
  }
  return validated;
}
