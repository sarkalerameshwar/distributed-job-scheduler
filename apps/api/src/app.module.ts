import { Module } from "@nestjs/common";
import { EnvModule } from "./config/env.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { RedisModule } from "./common/redis.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { ProjectsModule } from "./projects/projects.module";
import { QueuesModule } from "./queues/queues.module";
import { RetryPoliciesModule } from "./retry-policies/retry-policies.module";
import { JobsModule } from "./jobs/jobs.module";
import { SchedulerModule } from "./scheduler/scheduler.module";
import { DlqModule } from "./dlq/dlq.module";
import { WorkersModule } from "./workers/workers.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { WebsocketModule } from "./websocket/websocket.module";
import { MetricsModule } from "./metrics/metrics.module";

@Module({
  imports: [
    EnvModule,
    DatabaseModule,
    RedisModule,
    MetricsModule,
    RealtimeModule,
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ProjectsModule,
    QueuesModule,
    RetryPoliciesModule,
    JobsModule,
    SchedulerModule,
    DlqModule,
    WorkersModule,
    DashboardModule,
    WebsocketModule,
  ],
})
export class AppModule {}
