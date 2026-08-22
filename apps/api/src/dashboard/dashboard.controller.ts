import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { DashboardService } from "./dashboard.service";
import { DashboardQueryDto } from "./dto/dashboard.dto";

@ApiTags("dashboard")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("overview")
  @ApiOperation({
    summary: "Org-scoped operations overview (KPIs, queue health, workers, throughput, failures)",
  })
  async overview(@CurrentUser() user: AuthenticatedUser, @Query() query: DashboardQueryDto) {
    return {
      success: true,
      data: await this.dashboard.overview(user.id, query.organizationId),
    };
  }
}
