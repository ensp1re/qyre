import { useQueryClient } from "@tanstack/react-query";
import {
  createDatabase,
  createSchema,
  dropDatabase,
  dropSchema
} from "../../api/database-admin.js";

export function useDatabaseAdminMutations() {
  const queryClient = useQueryClient();

  return {
    createDatabase: async (name: string): Promise<void> => {
      await createDatabase(name);
      await queryClient.invalidateQueries({ queryKey: ["databases"] });
    },
    dropDatabase: async (name: string): Promise<void> => {
      await dropDatabase(name);
      await queryClient.invalidateQueries({ queryKey: ["databases"] });
    },
    createSchema: async (name: string): Promise<void> => {
      await createSchema(name);
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    dropSchema: async (name: string): Promise<void> => {
      await dropSchema(name);
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
    }
  };
}
