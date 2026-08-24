import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { SchedulerService } from "./scheduler.service";
import { ListSchedulesQueryDto, PreviewCronDto, UpdateScheduleDto } from "./dto/schedule.dto";

@ApiTags("schedules")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("schedules")
export class SchedulerController {
  constructor(private readonly schedules: SchedulerService) {}

  @Get()
  @ApiOperation({ summary: "List scheduled jobs for an organization" })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListSchedulesQueryDto) {
    return {
      success: true,
      data: await this.schedules.list(user.id, {
        ...query,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      }),
    };
  }

  @Post("preview")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "schedules.preview", limit: 60 })
  @ApiOperation({ summary: "Preview next cron fire times (auth required)" })
  preview(@CurrentUser() _user: AuthenticatedUser, @Body() dto: PreviewCronDto) {
    return { success: true, data: this.schedules.previewCron(dto) };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a schedule" })
  async get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.schedules.get(user.id, id) };
  }

  @Post(":id/pause")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "schedules.mutate", limit: 40 })
  @ApiOperation({ summary: "Pause a schedule (MEMBER+)" })
  async pause(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.schedules.pause(user.id, id) };
  }

  @Post(":id/resume")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "schedules.mutate", limit: 40 })
  @ApiOperation({ summary: "Resume a schedule (MEMBER+)" })
  async resume(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.schedules.resume(user.id, id) };
  }

  @Patch(":id")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "schedules.mutate", limit: 40 })
  @ApiOperation({ summary: "Update CRON expression/timezone/active (ADMIN+)" })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return { success: true, data: await this.schedules.update(user.id, id, dto) };
  }
}
