import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearConsoleEvents, fetchConsoleEvents } from "../api/console.js";
import { QUERY_RETRY } from "./query-retry.js";

const QUERY_KEY = ["console"];

/** React Query hook for the Console tab's event stream. Polls while connected. */
export function useConsoleEvents(options: { enabled: boolean }) {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchConsoleEvents,
    enabled: options.enabled,
    refetchInterval: options.enabled ? 3000 : false,
    ...QUERY_RETRY
  });
}

/** Mutation to clear the server's event log. */
export function useClearConsole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearConsoleEvents,
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
    }
  });
}
