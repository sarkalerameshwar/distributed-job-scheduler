import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly auth: AuthService) {}

  @Get("me")
  @ApiOperation({ summary: "Current authenticated user" })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.auth.me(user.id);
    return { success: true, data };
  }
}
