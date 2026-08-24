import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto, ListProjectsQueryDto, UpdateProjectDto } from "./dto/project.dto";

@ApiTags("projects")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "projects.mutate", limit: 30 })
  @ApiOperation({ summary: "Create a project (ADMIN+)" })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProjectDto) {
    return { success: true, data: await this.projects.create(user.id, dto) };
  }

  @Get()
  @ApiOperation({ summary: "List projects" })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListProjectsQueryDto) {
    return { success: true, data: await this.projects.list(user.id, { ...query, page: query.page ?? 1, limit: query.limit ?? 20 }) };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a project" })
  async get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return { success: true, data: await this.projects.get(user.id, id) };
  }

  @Patch(":id")
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "projects.mutate", limit: 30 })
  @ApiOperation({ summary: "Update a project (ADMIN+)" })
  async update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateProjectDto) {
    return { success: true, data: await this.projects.update(user.id, id, dto) };
  }
}
