import { useQueryClient } from "@tanstack/react-query";
import {
  createDatabase,
  createSchema,
  dropDatabase,
  dropSchema
} from "../../api/database-admin.js";

/**
 * Create/drop mutations for the connection switcher's database panel and the sidebar's Postgres
 * schema controls (F116) - plain async functions (not `useMutation`), since the packages/ui
 * components (`DatabasePanel`, `Sidebar`) await each call directly to know when to close their own
 * dialog, mirroring F114's `useTableDdlMutations`. Database mutations invalidate the databases
 * list; schema mutations invalidate the overview (the Schema tab/sidebar's own source of schemas).
 */
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
