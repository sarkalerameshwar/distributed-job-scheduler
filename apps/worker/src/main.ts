import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";
import { EnvService } from "./config/env.service";
import { ShutdownService } from "./shutdown.service";
import { WorkerService } from "./worker.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule, { bufferLogs: true });
  const env = app.get(EnvService);
  const logger = new Logger("WorkerBootstrap");

  app.enableShutdownHooks();
  await app.listen(env.healthPort);

  const worker = app.get(WorkerService);
  const shutdown = app.get(ShutdownService);
  const halt = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down`);
    worker.stopPolling();
    await shutdown.drain();
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void halt("SIGTERM"));
  process.on("SIGINT", () => void halt("SIGINT"));

  logger.log(
    JSON.stringify({
      msg: "worker_bootstrap",
      phase: 6,
      health: `http://localhost:${env.healthPort}/health`,
      concurrency: env.concurrency,
      pollIntervalMs: env.pollIntervalMs,
    }),
  );
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
