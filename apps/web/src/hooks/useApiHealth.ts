import { useQuery } from "@tanstack/react-query";
import { fetchApiHealth } from "../services/health";

export function useApiHealth() {
  return useQuery({
    queryKey: ["health", "api"],
    queryFn: fetchApiHealth,
    refetchInterval: 5000,
  });
}
