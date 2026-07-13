import { useMutation, useQueryClient } from "@tanstack/react-query";
import { switchDatabase } from "../api/database-admin.js";
import { DATABASE_QUERY_KEYS } from "./use-connect.js";

/**
 * Mutation to switch to a sibling database on the current server (F116) - the same
 * database-owned-cache reset `useConnect` (F064) applies on a full reconnect, since the connected
 * schemas/tables/rows are just as stale after an in-place switch. Also invalidates `["databases"]`
 * so the panel's "current" highlight moves to the new database.
 */
export function useSwitchDatabase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: switchDatabase,
    onSuccess: async () => {
      await Promise.all(
        DATABASE_QUERY_KEYS.map((queryKey) => queryClient.cancelQueries({ queryKey }))
      );
      await Promise.all(
        DATABASE_QUERY_KEYS.map((queryKey) => queryClient.resetQueries({ queryKey }))
      );
      await queryClient.invalidateQueries({ queryKey: ["health"] });
      await queryClient.invalidateQueries({ queryKey: ["databases"] });
    }
  });
}
