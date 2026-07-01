import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "../api/health.js";

/** React Query hook for the server's health/connection status. */
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false
  });
}
