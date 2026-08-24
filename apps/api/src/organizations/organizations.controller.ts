import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PaginationQueryDto } from "../common/pagination";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { OrganizationsService } from "./organizations.service";
import { CreateOrganizationDto, UpdateOrganizationDto } from "./dto/organization.dto";

@ApiTags("organizations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "orgs.mutate", limit: 20 })
  @ApiOperation({ summary: "Create an organization (caller becomes OWNER)" })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrganizationDto) {
    return { success: true, data: await this.organizations.create(user.id, dto) };
  }

  @Get()
  @ApiOperation({ summary: "List organizations the caller belongs to" })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return { success: true, data: await this.organizations.list(user.id, query.page ?? 1, query.limit ?? 20) };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get an organization" })
  async get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.organizations.get(user.id, id) };
  }

  @Patch(":id")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "orgs.mutate", limit: 20 })
  @ApiOperation({ summary: "Update an organization (ADMIN+)" })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return { success: true, data: await this.organizations.update(user.id, id, dto) };
  }
}
