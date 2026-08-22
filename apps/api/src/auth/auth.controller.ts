import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { LogoutDto, RefreshDto } from "./dto/refresh.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthRateLimitGuard } from "./guards/auth-rate-limit.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import type { AuthenticatedUser } from "./auth.types";

@ApiTags("auth")
@Controller("auth")
@UseGuards(AuthRateLimitGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @ApiOperation({ summary: "Register a new user" })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const data = await this.auth.register(dto, this.meta(req));
    return { success: true, data };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Login with email and password" })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const data = await this.auth.login(dto, this.meta(req));
    return { success: true, data };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotate refresh token and issue a new access token" })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const data = await this.auth.refresh(dto.refreshToken, this.meta(req));
    return { success: true, data };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Revoke the current refresh token, or all sessions if omitted" })
  async logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: LogoutDto) {
    await this.auth.logout(user.id, dto.refreshToken);
    return { success: true, data: { loggedOut: true } };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Current user and organization memberships" })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.auth.me(user.id);
    return { success: true, data };
  }

  private meta(req: Request) {
    return {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    };
  }
}
