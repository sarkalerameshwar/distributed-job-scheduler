import type { MemberRole, UserStatus } from "@djs/shared-types";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: string;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
};

export type MembershipView = {
  organizationId: string;
  name: string;
  slug: string;
  role: MemberRole;
};
