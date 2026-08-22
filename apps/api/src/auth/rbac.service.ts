import { HttpStatus, Injectable } from "@nestjs/common";
import type { MemberRole } from "@djs/shared-types";
import { PrismaService } from "../database/prisma.service";
import { AppError } from "../common/errors/app-error";
import { roleSatisfies } from "./rbac";

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async assertMembership(userId: string, organizationId: string, minimum: MemberRole): Promise<MemberRole> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) {
      throw new AppError(HttpStatus.FORBIDDEN, "ORGANIZATION_ACCESS_DENIED", "You do not have access to this organization");
    }
    if (!roleSatisfies(membership.role, minimum)) {
      throw new AppError(HttpStatus.FORBIDDEN, "INSUFFICIENT_ROLE", "Your role cannot perform this action", {
        required: minimum,
        actual: membership.role,
      });
    }
    return membership.role;
  }

  async assertProjectAccess(userId: string, projectId: string, minimum: MemberRole) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new AppError(HttpStatus.NOT_FOUND, "PROJECT_NOT_FOUND", "Project not found");
    }
    const role = await this.assertMembership(userId, project.organizationId, minimum);
    return { project, role };
  }

  async assertQueueAccess(userId: string, queueId: string, minimum: MemberRole) {
    const queue = await this.prisma.queue.findUnique({
      where: { id: queueId },
      include: { project: true, retryPolicy: true },
    });
    if (!queue) {
      throw new AppError(HttpStatus.NOT_FOUND, "QUEUE_NOT_FOUND", "Queue not found");
    }
    const role = await this.assertMembership(userId, queue.project.organizationId, minimum);
    return { queue, role };
  }

  async assertJobAccess(userId: string, jobId: string, minimum: MemberRole) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        queue: { include: { project: true, retryPolicy: true } },
        retryPolicy: true,
        schedule: true,
        deadLetterJob: true,
      },
    });
    if (!job) {
      throw new AppError(HttpStatus.NOT_FOUND, "JOB_NOT_FOUND", "Job not found");
    }
    const role = await this.assertMembership(userId, job.queue.project.organizationId, minimum);
    return { job, role };
  }
}
