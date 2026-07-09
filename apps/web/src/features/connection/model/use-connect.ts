import { useMutation, useQueryClient } from "@tanstack/react-query";
import { connectToTarget } from "../api/connect.js";

const DATABASE_QUERY_KEYS = [
  ["overview"],
  ["allTables"],
  ["table"],
  ["rows"],
  ["console"],
  ["files"],
  ["file-content"]
] as const;

/**
 * Mutation to switch the running server's database connection (F064). On success, invalidates
 * and clears database-owned React Query caches so old schemas/tables/rows never render stale under
 * the new target's name - the caller (App.tsx) still resets local navigation state React Query
 * doesn't own.
 */
export function useConnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: connectToTarget,
    onSuccess: async () => {
      await Promise.all(
        DATABASE_QUERY_KEYS.map((queryKey) => queryClient.cancelQueries({ queryKey }))
      );
      await Promise.all(
        DATABASE_QUERY_KEYS.map((queryKey) => queryClient.resetQueries({ queryKey }))
      );
      await queryClient.invalidateQueries({ queryKey: ["health"] });
    }
  });
}
