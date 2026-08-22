import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { JobsModule } from "../jobs/jobs.module";
import { DlqController } from "./dlq.controller";
import { DlqService } from "./dlq.service";

@Module({
  imports: [AuthModule, JobsModule],
  controllers: [DlqController],
  providers: [DlqService],
})
export class DlqModule {}
