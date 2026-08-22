import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";
import { EnvService } from "./config/env.service";
import { requestIdMiddleware } from "./common/request-id.middleware";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const env = app.get(EnvService);
  const logger = new Logger("Bootstrap");

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(json({ limit: "256kb" }));
  app.use(urlencoded({ extended: true, limit: "256kb" }));
  app.enableCors({
    origin: env.corsOrigin,
    credentials: true,
  });
  app.setGlobalPrefix("api/v1", {
    exclude: ["health", "health/live", "health/ready", "metrics"],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(env));

  const swagger = new DocumentBuilder()
    .setTitle("Distributed Job Scheduler API")
    .setDescription("JWT auth, jobs, queues, realtime, and Prometheus metrics.")
    .setVersion("0.15.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swagger));

  app.enableShutdownHooks();

  await app.listen(env.port);
  logger.log(`API listening on port ${env.port} (${env.nodeEnv})`);
  logger.log(`Swagger: http://localhost:${env.port}/docs`);
  logger.log(`Health:  http://localhost:${env.port}/health`);
  logger.log(`Metrics: http://localhost:${env.port}/metrics`);
  logger.log(`Realtime: ws://localhost:${env.port}/realtime`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
