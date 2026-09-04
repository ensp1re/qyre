import { useMutation, useQueryClient } from "@tanstack/react-query";
import { switchDatabase } from "../../api/database-admin.js";
import { DATABASE_QUERY_KEYS } from "../session/use-connect.js";

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
