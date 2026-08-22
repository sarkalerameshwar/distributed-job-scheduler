import type { MemberRole } from "@djs/shared-types";

const RANK: Record<MemberRole, number> = {
  VIEWER: 1,
  MEMBER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function roleSatisfies(actual: MemberRole, minimum: MemberRole): boolean {
  return RANK[actual] >= RANK[minimum];
}
