import { useMutation, useQueryClient } from "@tanstack/react-query";
import { connectToTarget } from "./api/connect.js";

/**
 * Mutation to switch the running server's database connection (F064). On success, invalidates
 * every React Query cache so nothing from the old database renders stale under the new target's
 * name - the caller (App.tsx) still resets `selected`/`page` itself, since that's local component
 * state React Query doesn't own.
 */
export function useConnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: connectToTarget,
    onSuccess: () => {
      void queryClient.invalidateQueries();
    }
  });
}
