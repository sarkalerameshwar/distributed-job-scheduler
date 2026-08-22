import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { RbacService } from "../auth/rbac.service";
import { AppError } from "../common/errors/app-error";
import { paginatedResult, toSkipTake } from "../common/pagination";
import { slugify } from "../common/slug";
import { rethrowUnique } from "../common/prisma-errors";
import type { CreateOrganizationDto, UpdateOrganizationDto } from "./dto/organization.dto";

const DEFAULT_POLICIES = [
  { name: "fixed-3x", strategy: "FIXED" as const, maxAttempts: 3, initialDelayMs: 5_000, maxDelayMs: 5_000, multiplier: 1 },
  { name: "linear-5x", strategy: "LINEAR" as const, maxAttempts: 5, initialDelayMs: 2_000, maxDelayMs: 30_000, multiplier: 1 },
  { name: "exponential-4x", strategy: "EXPONENTIAL" as const, maxAttempts: 4, initialDelayMs: 1_000, maxDelayMs: 60_000, multiplier: 2 },
];

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    const slug = dto.slug ?? slugify(dto.name);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: { name: dto.name.trim(), slug },
        });
        await tx.organizationMember.create({
          data: { organizationId: organization.id, userId, role: "OWNER" },
        });
        await tx.retryPolicy.createMany({
          data: DEFAULT_POLICIES.map((policy) => ({ ...policy, organizationId: organization.id })),
        });
        return this.toView(organization, "OWNER");
      });
    } catch (error) {
      rethrowUnique(error, "SLUG_TAKEN", "An organization with this slug already exists");
    }
  }

  async list(userId: string, page: number, limit: number) {
    const where = { userId };
    const total = await this.prisma.organizationMember.count({ where });
    const memberships = await this.prisma.organizationMember.findMany({
      where,
      include: { organization: true },
      orderBy: { createdAt: "desc" },
      ...toSkipTake(page, limit),
    });
    return paginatedResult(
      memberships.map((m) => this.toView(m.organization, m.role)),
      total,
      page,
      limit,
    );
  }

  async get(userId: string, id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      include: { _count: { select: { projects: true, members: true } } },
    });
    if (!organization) {
      throw new AppError(HttpStatus.NOT_FOUND, "ORGANIZATION_NOT_FOUND", "Organization not found");
    }
    const role = await this.rbac.assertMembership(userId, id, "VIEWER");
    return {
      ...this.toView(organization, role),
      projectCount: organization._count.projects,
      memberCount: organization._count.members,
    };
  }

  async update(userId: string, id: string, dto: UpdateOrganizationDto) {
    await this.rbac.assertMembership(userId, id, "ADMIN");
    try {
      const organization = await this.prisma.organization.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          slug: dto.slug,
        },
      });
      const role = await this.rbac.assertMembership(userId, id, "VIEWER");
      return this.toView(organization, role);
    } catch (error) {
      rethrowUnique(error, "SLUG_TAKEN", "An organization with this slug already exists");
    }
  }

  private toView(organization: { id: string; name: string; slug: string; createdAt: Date; updatedAt: Date }, role: string) {
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
    };
  }
}
