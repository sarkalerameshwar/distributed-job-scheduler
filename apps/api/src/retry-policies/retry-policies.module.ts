import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RetryPoliciesController } from "./retry-policies.controller";
import { RetryPoliciesService } from "./retry-policies.service";

@Module({
  imports: [AuthModule],
  controllers: [RetryPoliciesController],
  providers: [RetryPoliciesService],
})
export class RetryPoliciesModule {}
