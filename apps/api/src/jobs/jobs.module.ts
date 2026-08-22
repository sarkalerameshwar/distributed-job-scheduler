import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { JobCreateRateLimitGuard } from "./guards/job-create-rate-limit.guard";

@Module({
  imports: [AuthModule],
  controllers: [JobsController],
  providers: [JobsService, JobCreateRateLimitGuard],
  exports: [JobsService],
})
export class JobsModule {}
