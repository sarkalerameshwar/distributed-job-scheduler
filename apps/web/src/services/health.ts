import type { HealthResponse } from "@djs/shared-types";

const API_HEALTH_URL = "/health";

export async function fetchApiHealth(): Promise<HealthResponse> {
  const response = await fetch(API_HEALTH_URL);
  if (!response.ok) {
    throw new Error(`Health check failed (${response.status})`);
  }
  return (await response.json()) as HealthResponse;
}
