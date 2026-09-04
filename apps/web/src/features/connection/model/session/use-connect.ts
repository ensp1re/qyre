import { useMutation, useQueryClient } from "@tanstack/react-query";
import { connectToTarget } from "../../api/connect.js";

export const DATABASE_QUERY_KEYS = [
  ["overview"],
  ["allTables"],
  ["table"],
  ["rows"],
  ["console"],
  ["files"],
  ["file-content"],
  ["access"]
] as const;

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
