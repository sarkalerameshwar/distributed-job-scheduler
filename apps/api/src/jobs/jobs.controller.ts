import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PaginationQueryDto } from "../common/pagination";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { JobsService } from "./jobs.service";
import { CreateBatchJobsDto, CreateJobDto, ListJobLogsQueryDto, ListJobsQueryDto } from "./dto/job.dto";

@ApiTags("jobs")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("jobs")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "jobs.create", limit: 60 })
  @ApiHeader({ name: "Idempotency-Key", required: false })
  @ApiOperation({ summary: "Create a job (MEMBER+). Supports immediate/delayed/scheduled/recurring." })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateJobDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const data = await this.jobs.create(user.id, dto, idempotencyKey);
    return { success: true, data };
  }

  @Post("batch")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "jobs.batch", limit: 20 })
  @ApiOperation({ summary: "Atomically create a batch of jobs (MEMBER+)" })
  async createBatch(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBatchJobsDto) {
    return { success: true, data: await this.jobs.createBatch(user.id, dto) };
  }

  @Get()
  @ApiOperation({ summary: "List jobs with filters and pagination" })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListJobsQueryDto) {
    return {
      success: true,
      data: await this.jobs.list(user.id, {
        ...query,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      }),
    };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a job" })
  async get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.jobs.get(user.id, id) };
  }

  @Post(":id/cancel")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "jobs.cancel", limit: 60 })
  @ApiOperation({ summary: "Cancel a queued/scheduled/retrying/claimed/running job" })
  async cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.jobs.cancel(user.id, id) };
  }

  @Post(":id/retry")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "jobs.retry", limit: 30 })
  @ApiOperation({ summary: "Manually re-queue a failed, cancelled, or DLQ job" })
  async retry(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.jobs.retry(user.id, id) };
  }

  @Get(":id/executions/:executionId")
  @ApiOperation({ summary: "Get one execution attempt with result, errors, and linked logs" })
  async executionDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("executionId") executionId: string,
  ) {
    return { success: true, data: await this.jobs.getExecution(user.id, id, executionId) };
  }

  @Get(":id/executions")
  @ApiOperation({ summary: "List execution attempts for a job (audit history)" })
  async executions(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return {
      success: true,
      data: await this.jobs.listExecutions(user.id, id, query.page ?? 1, query.limit ?? 20),
    };
  }

  @Get(":id/logs")
  @ApiOperation({ summary: "List job logs (optional executionId / level filters)" })
  async logs(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query() query: ListJobLogsQueryDto,
  ) {
    return {
      success: true,
      data: await this.jobs.listLogs(user.id, id, query.page ?? 1, query.limit ?? 50, {
        executionId: query.executionId,
        level: query.level,
      }),
    };
  }
}
