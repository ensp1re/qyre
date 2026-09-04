import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearConsoleEvents, fetchConsoleEvents } from "../api/console.js";
import { QUERY_RETRY } from "../../../shared/lib/query/retry.js";

const QUERY_KEY = ["console"];

export function useConsoleEvents(options: { enabled: boolean }) {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchConsoleEvents,
    enabled: options.enabled,
    refetchInterval: options.enabled ? 3000 : false,
    ...QUERY_RETRY
  });
}

export function useClearConsole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearConsoleEvents,
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
    }
  });
}
