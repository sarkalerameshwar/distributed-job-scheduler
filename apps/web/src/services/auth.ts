import { apiFetch, getStoredRefreshToken, setAccessToken, setStoredRefreshToken } from "./api";
import type { AuthPayload, MembershipView, PublicUser } from "../types/auth";

export async function loginRequest(email: string, password: string): Promise<AuthPayload> {
  return apiFetch<AuthPayload>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function registerRequest(input: { email: string; password: string; name: string }): Promise<AuthPayload> {
  return apiFetch<AuthPayload>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function refreshRequest(refreshToken: string): Promise<AuthPayload> {
  return apiFetch<AuthPayload>("/api/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export async function logoutRequest(refreshToken: string | null): Promise<void> {
  await apiFetch("/api/v1/auth/logout", {
    method: "POST",
    body: JSON.stringify(refreshToken ? { refreshToken } : {}),
  });
}

export async function meRequest(): Promise<{ user: PublicUser; memberships: MembershipView[] }> {
  return apiFetch("/api/v1/auth/me");
}

export function persistSession(payload: AuthPayload): void {
  setAccessToken(payload.tokens.accessToken);
  setStoredRefreshToken(payload.tokens.refreshToken);
}

export function clearSession(): void {
  setAccessToken(null);
  setStoredRefreshToken(null);
}

export { getStoredRefreshToken };
