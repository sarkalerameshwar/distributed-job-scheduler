import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { RbacService } from "./rbac.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { OrganizationRolesGuard } from "./guards/organization-roles.guard";
import { AuthRateLimitGuard } from "./guards/auth-rate-limit.guard";

@Module({
  imports: [PassportModule.register({ defaultStrategy: "jwt" }), JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RbacService, JwtAuthGuard, OrganizationRolesGuard, AuthRateLimitGuard],
  exports: [AuthService, RbacService, JwtAuthGuard, OrganizationRolesGuard, JwtModule],
})
export class AuthModule {}
