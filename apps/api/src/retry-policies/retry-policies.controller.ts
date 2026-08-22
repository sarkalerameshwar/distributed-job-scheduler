import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RetryPoliciesService } from "./retry-policies.service";
import {
  CreateRetryPolicyDto,
  ListRetryPoliciesQueryDto,
  PreviewRetryPolicyDto,
  UpdateRetryPolicyDto,
} from "./dto/retry-policy.dto";

@ApiTags("retry-policies")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("retry-policies")
export class RetryPoliciesController {
  constructor(private readonly policies: RetryPoliciesService) {}

  @Get()
  @ApiOperation({ summary: "List retry policies for an organization" })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListRetryPoliciesQueryDto) {
    return { success: true, data: await this.policies.list(user.id, query.organizationId) };
  }

  @Post("preview")
  @ApiOperation({ summary: "Preview FIXED/LINEAR/EXPONENTIAL backoff schedule (VIEWER+)" })
  async preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: PreviewRetryPolicyDto) {
    return { success: true, data: await this.policies.preview(user.id, dto) };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a retry policy" })
  async get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.policies.get(user.id, id) };
  }

  @Post()
  @ApiOperation({ summary: "Create a retry policy (ADMIN+)" })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRetryPolicyDto) {
    return { success: true, data: await this.policies.create(user.id, dto) };
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a retry policy (ADMIN+)" })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateRetryPolicyDto,
  ) {
    return { success: true, data: await this.policies.update(user.id, id, dto) };
  }
}
