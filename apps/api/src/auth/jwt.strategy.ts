import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { EnvService } from "../config/env.service";
import { PrismaService } from "../database/prisma.service";
import type { AuthenticatedUser } from "./auth.types";

type AccessPayload = {
  sub: string;
  email: string;
  typ: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    env: EnvService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.jwtAccessSecret,
    });
  }

  async validate(payload: AccessPayload): Promise<AuthenticatedUser> {
    if (payload.typ !== "access") {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException();
    }
    return user;
  }
}
