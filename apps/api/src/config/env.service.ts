import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class EnvService {
  constructor(private readonly config: ConfigService) {}

  get nodeEnv(): string {
    return this.config.getOrThrow<string>("NODE_ENV");
  }

  get port(): number {
    return Number(this.config.getOrThrow("PORT"));
  }

  get databaseUrl(): string {
    return this.config.getOrThrow<string>("DATABASE_URL");
  }

  get redisHost(): string {
    return this.config.getOrThrow<string>("REDIS_HOST");
  }

  get redisPort(): number {
    return Number(this.config.getOrThrow("REDIS_PORT"));
  }

  get redisPassword(): string | undefined {
    return this.config.get<string>("REDIS_PASSWORD") || undefined;
  }

  get corsOrigin(): string {
    return this.config.getOrThrow<string>("CORS_ORIGIN");
  }

  get jwtAccessSecret(): string {
    return this.config.getOrThrow<string>("JWT_ACCESS_SECRET");
  }

  get jwtRefreshSecret(): string {
    return this.config.getOrThrow<string>("JWT_REFRESH_SECRET");
  }

  get jwtAccessExpiresIn(): string {
    return this.config.getOrThrow<string>("JWT_ACCESS_EXPIRES_IN");
  }

  get jwtRefreshExpiresIn(): string {
    return this.config.getOrThrow<string>("JWT_REFRESH_EXPIRES_IN");
  }

  get jobDefaultTimeoutMs(): number {
    return Number(this.config.get("JOB_DEFAULT_TIMEOUT_MS") ?? 30_000);
  }

  get isProduction(): boolean {
    return this.nodeEnv === "production";
  }
}
