export type PublicUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
};

export type MembershipView = {
  organizationId: string;
  name: string;
  slug: string;
  role: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: string;
};

export type AuthPayload = {
  user: PublicUser;
  tokens: AuthTokens;
  memberships?: MembershipView[];
};

export type ApiError = {
  success: false;
  error: { code: string; message: string; details: Record<string, unknown> };
  requestId: string;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
};
