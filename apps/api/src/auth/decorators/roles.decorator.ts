import { SetMetadata } from "@nestjs/common";
import type { MemberRole } from "@djs/shared-types";

export const ROLES_KEY = "rbac_roles";
export const ORG_ID_PARAM_KEY = "rbac_org_param";

/** Minimum organization role required. Pair with OrganizationRolesGuard. */
export const Roles = (...roles: MemberRole[]) => SetMetadata(ROLES_KEY, roles);

export const OrgIdParam = (param = "organizationId") => SetMetadata(ORG_ID_PARAM_KEY, param);
