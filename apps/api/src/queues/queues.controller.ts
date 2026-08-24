import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { QueuesService } from "./queues.service";
import { CreateQueueDto, ListQueuesQueryDto, UpdateQueueDto } from "./dto/queue.dto";

@ApiTags("queues")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("queues")
export class QueuesController {
  constructor(private readonly queues: QueuesService) {}

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "queues.mutate", limit: 30 })
  @ApiOperation({ summary: "Create a queue (ADMIN+)" })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateQueueDto) {
    return { success: true, data: await this.queues.create(user.id, dto) };
  }

  @Get()
  @ApiOperation({ summary: "List queues" })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListQueuesQueryDto) {
    return { success: true, data: await this.queues.list(user.id, { ...query, page: query.page ?? 1, limit: query.limit ?? 20 }) };
  }

  @Get(":id/stats")
  @ApiOperation({ summary: "Queue depth, status counts, throughput" })
  async stats(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.queues.stats(user.id, id) };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a queue" })
  async get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.queues.get(user.id, id) };
  }

  @Patch(":id")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "queues.mutate", limit: 30 })
  @ApiOperation({ summary: "Update queue configuration (ADMIN+)" })
  async update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateQueueDto) {
    return { success: true, data: await this.queues.update(user.id, id, dto) };
  }

  @Post(":id/pause")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "queues.mutate", limit: 30 })
  @ApiOperation({ summary: "Pause a queue — running jobs may finish" })
  async pause(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.queues.pause(user.id, id) };
  }

  @Post(":id/resume")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "queues.mutate", limit: 30 })
  @ApiOperation({ summary: "Resume a paused queue" })
  async resume(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.queues.resume(user.id, id) };
  }

  @Post(":id/archive")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "queues.mutate", limit: 30 })
  @ApiOperation({ summary: "Archive (disable) a queue without deleting history" })
  async archive(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.queues.archive(user.id, id) };
  }
}
