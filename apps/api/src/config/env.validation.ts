import { IsInt, IsNotEmpty, IsOptional, IsString, Min, MinLength, validateSync } from "class-validator";
import { plainToInstance, Type } from "class-transformer";

/**
 * Fail-fast environment contract. The process must not start if required
 * secrets or connection settings are missing. JWT secrets are required in
 * Phase 1 even though auth is not implemented yet, so later phases cannot
 * accidentally ship with empty secrets.
 */
export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  NODE_ENV!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PORT!: number;

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

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_EXPIRES_IN!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_EXPIRES_IN!: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN!: string;

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  WORKER_CONCURRENCY!: number;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  HEARTBEAT_INTERVAL_MS!: number;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  HEARTBEAT_TIMEOUT_MS!: number;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  JOB_DEFAULT_TIMEOUT_MS!: number;
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(", "))
      .join("; ");
    throw new Error(`Invalid environment configuration: ${messages}`);
  }
  return validated;
}
