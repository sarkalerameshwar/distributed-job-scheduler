import { HttpStatus, Injectable } from "@nestjs/common";
import { buildRetrySchedule, calculateRetryDelay } from "@djs/shared-types";
import { PrismaService } from "../database/prisma.service";
import { RbacService } from "../auth/rbac.service";
import { AppError } from "../common/errors/app-error";
import { rethrowUnique } from "../common/prisma-errors";
import type {
  CreateRetryPolicyDto,
  PreviewRetryPolicyDto,
  UpdateRetryPolicyDto,
} from "./dto/retry-policy.dto";

@Injectable()
export class RetryPoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async list(userId: string, organizationId: string) {
    await this.rbac.assertMembership(userId, organizationId, "VIEWER");
    const policies = await this.prisma.retryPolicy.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });
    return policies.map((p) => this.toView(p));
  }

  async get(userId: string, id: string) {
    const policy = await this.prisma.retryPolicy.findUnique({ where: { id } });
    if (!policy) {
      throw new AppError(HttpStatus.NOT_FOUND, "RETRY_POLICY_NOT_FOUND", "Retry policy not found");
    }
    await this.rbac.assertMembership(userId, policy.organizationId, "VIEWER");
    return this.toView(policy);
  }

  async create(userId: string, dto: CreateRetryPolicyDto) {
    await this.rbac.assertMembership(userId, dto.organizationId, "ADMIN");
    this.assertDelayBounds(dto.initialDelayMs, dto.maxDelayMs);
    try {
      const policy = await this.prisma.retryPolicy.create({
        data: {
          organizationId: dto.organizationId,
          name: dto.name.trim(),
          strategy: dto.strategy,
          maxAttempts: dto.maxAttempts,
          initialDelayMs: dto.initialDelayMs,
          maxDelayMs: dto.maxDelayMs,
          multiplier: dto.multiplier ?? 2,
        },
      });
      return this.toView(policy);
    } catch (error) {
      rethrowUnique(error, "RETRY_POLICY_NAME_TAKEN", "A retry policy with this name already exists");
    }
  }

  async update(userId: string, id: string, dto: UpdateRetryPolicyDto) {
    const existing = await this.prisma.retryPolicy.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(HttpStatus.NOT_FOUND, "RETRY_POLICY_NOT_FOUND", "Retry policy not found");
    }
    await this.rbac.assertMembership(userId, existing.organizationId, "ADMIN");

    const initialDelayMs = dto.initialDelayMs ?? existing.initialDelayMs;
    const maxDelayMs = dto.maxDelayMs ?? existing.maxDelayMs;
    this.assertDelayBounds(initialDelayMs, maxDelayMs);

    try {
      const policy = await this.prisma.retryPolicy.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          strategy: dto.strategy,
          maxAttempts: dto.maxAttempts,
          initialDelayMs: dto.initialDelayMs,
          maxDelayMs: dto.maxDelayMs,
          multiplier: dto.multiplier,
        },
      });
      return this.toView(policy);
    } catch (error) {
      rethrowUnique(error, "RETRY_POLICY_NAME_TAKEN", "A retry policy with this name already exists");
    }
  }

  async preview(userId: string, dto: PreviewRetryPolicyDto) {
    let strategy = dto.strategy;
    let maxAttempts = dto.maxAttempts;
    let initialDelayMs = dto.initialDelayMs;
    let maxDelayMs = dto.maxDelayMs;
    let multiplier = dto.multiplier ?? 2;
    let policyId: string | null = null;

    if (dto.policyId) {
      const policy = await this.prisma.retryPolicy.findUnique({ where: { id: dto.policyId } });
      if (!policy) {
        throw new AppError(HttpStatus.NOT_FOUND, "RETRY_POLICY_NOT_FOUND", "Retry policy not found");
      }
      await this.rbac.assertMembership(userId, policy.organizationId, "VIEWER");
      strategy = policy.strategy;
      maxAttempts = policy.maxAttempts;
      initialDelayMs = policy.initialDelayMs;
      maxDelayMs = policy.maxDelayMs;
      multiplier = Number(policy.multiplier);
      policyId = policy.id;
    } else if (
      strategy === undefined ||
      maxAttempts === undefined ||
      initialDelayMs === undefined ||
      maxDelayMs === undefined
    ) {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "PREVIEW_PARAMS_REQUIRED",
        "Provide policyId or strategy/maxAttempts/initialDelayMs/maxDelayMs",
      );
    }

    this.assertDelayBounds(initialDelayMs, maxDelayMs);

    const schedule = buildRetrySchedule({
      strategy,
      maxAttempts,
      initialDelayMs,
      maxDelayMs,
      multiplier,
      jitterRatio: dto.jitterRatio ?? 0,
    });

    const delayForAttempt =
      dto.attempt !== undefined
        ? calculateRetryDelay({
            strategy,
            attempt: dto.attempt,
            initialDelayMs,
            maxDelayMs,
            multiplier,
            jitterRatio: dto.jitterRatio ?? 0,
            random: () => 0.5,
          })
        : null;

    return {
      policyId,
      strategy,
      maxAttempts,
      initialDelayMs,
      maxDelayMs,
      multiplier,
      jitterRatio: dto.jitterRatio ?? 0,
      schedule,
      delayForAttempt,
      totalBackoffMs: schedule.reduce((sum, row) => sum + row.delayMs, 0),
    };
  }

  private assertDelayBounds(initialDelayMs: number, maxDelayMs: number): void {
    if (maxDelayMs < initialDelayMs) {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "INVALID_RETRY_DELAYS",
        "maxDelayMs must be greater than or equal to initialDelayMs",
      );
    }
  }

  private toView(policy: {
    id: string;
    organizationId: string;
    name: string;
    strategy: string;
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    multiplier: { toNumber: () => number } | number;
  }) {
    return {
      id: policy.id,
      organizationId: policy.organizationId,
      name: policy.name,
      strategy: policy.strategy,
      maxAttempts: policy.maxAttempts,
      initialDelayMs: policy.initialDelayMs,
      maxDelayMs: policy.maxDelayMs,
      multiplier: typeof policy.multiplier === "number" ? policy.multiplier : policy.multiplier.toNumber(),
    };
  }
}
