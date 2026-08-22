import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { WorkersService } from "./workers.service";
import { ListWorkersQueryDto } from "./dto/workers.dto";

@ApiTags("workers")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("workers")
export class WorkersController {
  constructor(private readonly workers: WorkersService) {}

  @Get()
  @ApiOperation({ summary: "List registered workers (platform-wide)" })
  async list(@Query() query: ListWorkersQueryDto) {
    return {
      success: true,
      data: await this.workers.list({
        ...query,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      }),
    };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a worker by id or public workerId, with recent heartbeats" })
  async get(@Param("id") id: string) {
    return { success: true, data: await this.workers.get(id) };
  }
}
