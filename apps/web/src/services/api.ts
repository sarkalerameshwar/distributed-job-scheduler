import type { ApiError, ApiSuccess } from "../types/auth";

const REFRESH_KEY = "djs.refreshToken";

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setStoredRefreshToken(token: string | null): void {
  if (token) {
    localStorage.setItem(REFRESH_KEY, token);
  } else {
    localStorage.removeItem(REFRESH_KEY);
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError | null,
  ) {
    super(body?.error.message ?? `Request failed (${status})`);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(path, { ...init, headers });
  const json = (await response.json().catch(() => null)) as ApiSuccess<T> | ApiError | null;

  if (!response.ok) {
    throw new ApiRequestError(response.status, json && "error" in json ? json : null);
  }
  if (json && "success" in json && json.success) {
    return json.data;
  }
  return json as T;
}
