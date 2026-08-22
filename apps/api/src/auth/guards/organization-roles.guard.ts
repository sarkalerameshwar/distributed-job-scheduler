import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { MemberRole } from "@djs/shared-types";
import { AppError } from "../../common/errors/app-error";
import { ORG_ID_PARAM_KEY, ROLES_KEY } from "../decorators/roles.decorator";
import type { AuthenticatedUser } from "../auth.types";
import { RbacService } from "../rbac.service";

/**
 * Enforces organization membership + minimum role.
 * Organization/project routes in later phases attach @Roles() and @OrgIdParam().
 */
@Injectable()
export class OrganizationRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<MemberRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) {
      return true;
    }

    const param = this.reflector.getAllAndOverride<string>(ORG_ID_PARAM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? "organizationId";

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      params: Record<string, string>;
      body: Record<string, unknown>;
      query: Record<string, unknown>;
    }>();

    const user = request.user;
    if (!user) {
      throw new AppError(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Authentication required");
    }

    const organizationId =
      request.params[param] ??
      (typeof request.body[param] === "string" ? (request.body[param] as string) : undefined) ??
      (typeof request.query[param] === "string" ? (request.query[param] as string) : undefined);

    if (!organizationId) {
      throw new AppError(HttpStatus.BAD_REQUEST, "ORGANIZATION_REQUIRED", "Organization context is required");
    }

    const minimum = roles.reduce((highest, role) => {
      // Caller may list several acceptable roles; require the least privileged of them.
      const order: MemberRole[] = ["VIEWER", "MEMBER", "ADMIN", "OWNER"];
      return order.indexOf(role) < order.indexOf(highest) ? role : highest;
    }, roles[0]!);

    await this.rbac.assertMembership(user.id, organizationId, minimum);
    return true;
  }
}
