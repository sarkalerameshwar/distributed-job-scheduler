import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { DlqService } from "./dlq.service";
import { ListDlqQueryDto, ResolveDlqDto } from "./dto/dlq.dto";

@ApiTags("dlq")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("dlq")
export class DlqController {
  constructor(private readonly dlq: DlqService) {}

  @Get()
  @ApiOperation({ summary: "List dead-letter entries for an organization" })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListDlqQueryDto) {
    return {
      success: true,
      data: await this.dlq.list(user.id, {
        ...query,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      }),
    };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a dead-letter entry with final execution detail" })
  async get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.dlq.get(user.id, id) };
  }

  @Post(":id/retry")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "dlq.retry", limit: 30 })
  @ApiOperation({ summary: "Re-queue the DLQ job (MEMBER+); marks resolution RETRIED" })
  async retry(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.dlq.retry(user.id, id) };
  }

  @Post(":id/discard")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "dlq.resolve", limit: 60 })
  @ApiOperation({ summary: "Discard a DLQ entry without re-running (MEMBER+)" })
  async discard(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: ResolveDlqDto,
  ) {
    return { success: true, data: await this.dlq.discard(user.id, id, body.note) };
  }

  @Post(":id/resolve")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "dlq.resolve", limit: 60 })
  @ApiOperation({ summary: "Mark a DLQ entry resolved without re-running (MEMBER+)" })
  async resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: ResolveDlqDto,
  ) {
    return { success: true, data: await this.dlq.resolve(user.id, id, body.note) };
  }
}
