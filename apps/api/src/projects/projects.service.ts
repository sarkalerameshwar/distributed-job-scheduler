import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { RbacService } from "../auth/rbac.service";
import { paginatedResult, toSkipTake } from "../common/pagination";
import { slugify } from "../common/slug";
import { rethrowUnique } from "../common/prisma-errors";
import type { CreateProjectDto, ListProjectsQueryDto, UpdateProjectDto } from "./dto/project.dto";

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async create(userId: string, dto: CreateProjectDto) {
    await this.rbac.assertMembership(userId, dto.organizationId, "ADMIN");
    const slug = dto.slug ?? slugify(dto.name);
    try {
      const project = await this.prisma.project.create({
        data: {
          organizationId: dto.organizationId,
          name: dto.name.trim(),
          slug,
          description: dto.description?.trim(),
        },
      });
      return this.toView(project);
    } catch (error) {
      rethrowUnique(error, "PROJECT_SLUG_TAKEN", "A project with this slug already exists in the organization");
    }
  }

  async list(userId: string, query: ListProjectsQueryDto) {
    const orgIds = await this.memberOrgIds(userId, query.organizationId);
    if (orgIds.length === 0) {
      return paginatedResult([], 0, query.page, query.limit);
    }
    const where: Prisma.ProjectWhereInput = {
      organizationId: { in: orgIds },
      status: query.status,
    };
    const total = await this.prisma.project.count({ where });
    const projects = await this.prisma.project.findMany({
      where,
      include: { _count: { select: { queues: true } }, organization: true },
      orderBy: { createdAt: "desc" },
      ...toSkipTake(query.page, query.limit),
    });
    return paginatedResult(
      projects.map((p) => ({
        ...this.toView(p),
        organizationName: p.organization.name,
        queueCount: p._count.queues,
      })),
      total,
      query.page,
      query.limit,
    );
  }

  async get(userId: string, id: string) {
    const { project } = await this.rbac.assertProjectAccess(userId, id, "VIEWER");
    const full = await this.prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      include: { _count: { select: { queues: true, jobs: true } }, organization: true },
    });
    return {
      ...this.toView(full),
      organizationName: full.organization.name,
      queueCount: full._count.queues,
      jobCount: full._count.jobs,
    };
  }

  async update(userId: string, id: string, dto: UpdateProjectDto) {
    await this.rbac.assertProjectAccess(userId, id, "ADMIN");
    const project = await this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description,
        status: dto.status,
      },
    });
    return this.toView(project);
  }

  private async memberOrgIds(userId: string, organizationId?: string): Promise<string[]> {
    if (organizationId) {
      await this.rbac.assertMembership(userId, organizationId, "VIEWER");
      return [organizationId];
    }
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    const ids = memberships.map((m) => m.organizationId);
    return ids;
  }

  private toView(project: {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    description: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      slug: project.slug,
      description: project.description,
      status: project.status,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }
}
