import { randomUUID } from "crypto";
import { compare, hash } from "bcryptjs";
import { HttpStatus, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Prisma, User } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { EnvService } from "../config/env.service";
import { AppError } from "../common/errors/app-error";
import { parseDurationMs } from "../common/duration";
import { validatePassword } from "../common/password-policy";
import type { AuthTokens, MembershipView, PublicUser } from "./auth.types";
import { sha256Hex } from "./token.util";
import type { RegisterDto } from "./dto/register.dto";
import type { LoginDto } from "./dto/login.dto";

const BCRYPT_COST = 12;

type TokenTtl = `${number}${"ms" | "s" | "m" | "h" | "d"}`;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly env: EnvService,
  ) {}

  async register(dto: RegisterDto, meta: { ip?: string; userAgent?: string }) {
    const failures = validatePassword(dto.password);
    if (failures.length > 0) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "PASSWORD_POLICY", "Password does not meet requirements", {
        failures,
      });
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(HttpStatus.CONFLICT, "EMAIL_TAKEN", "An account with this email already exists");
    }

    const passwordHash = await hash(dto.password, BCRYPT_COST);
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash,
        status: "ACTIVE",
      },
    });

    const tokens = await this.issueSession(user, meta);
    return { user: this.toPublicUser(user), tokens };
  }

  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string }) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = user ? await compare(dto.password, user.passwordHash) : false;
    if (!user || !valid) {
      throw new AppError(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Invalid email or password");
    }
    if (user.status !== "ACTIVE") {
      throw new AppError(HttpStatus.FORBIDDEN, "ACCOUNT_DISABLED", "This account is disabled");
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const tokens = await this.issueSession(updated, meta);
    return { user: this.toPublicUser(updated), tokens };
  }

  async refresh(refreshToken: string, meta: { ip?: string; userAgent?: string }) {
    const tokenHash = sha256Hex(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() <= Date.now()) {
      throw new AppError(HttpStatus.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
    }
    if (stored.user.status !== "ACTIVE") {
      throw new AppError(HttpStatus.FORBIDDEN, "ACCOUNT_DISABLED", "This account is disabled");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      const tokens = await this.issueSession(stored.user, meta, tx);
      return { user: this.toPublicUser(stored.user), tokens };
    });
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash: sha256Hex(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<{ user: PublicUser; memberships: MembershipView[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: { include: { organization: true } },
      },
    });
    return {
      user: this.toPublicUser(user),
      memberships: user.memberships.map((m) => ({
        organizationId: m.organizationId,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      })),
    };
  }

  private async issueSession(
    user: User,
    meta: { ip?: string; userAgent?: string },
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<AuthTokens> {
    const accessTtl = this.env.jwtAccessExpiresIn as TokenTtl;
    const refreshTtl = this.env.jwtRefreshExpiresIn as TokenTtl;

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, typ: "access" },
      { secret: this.env.jwtAccessSecret, expiresIn: accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, typ: "refresh", jti: randomUUID() },
      { secret: this.env.jwtRefreshSecret, expiresIn: refreshTtl },
    );

    await db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(refreshToken),
        expiresAt: new Date(Date.now() + parseDurationMs(this.env.jwtRefreshExpiresIn)),
        ipAddress: meta.ip?.slice(0, 64),
        userAgent: meta.userAgent?.slice(0, 512),
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: this.env.jwtAccessExpiresIn,
    };
  }

  toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    };
  }
}
