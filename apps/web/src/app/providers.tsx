import { ErrorBoundary } from "@qyre/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { subscribePermissionDenied } from "../shared/api/permission-denied.js";

const queryClient = new QueryClient();

export async function refreshPermissionQueries(
  client: Pick<QueryClient, "invalidateQueries">
): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["overview"] }),
    client.invalidateQueries({ queryKey: ["allTables"] }),
    client.invalidateQueries({ queryKey: ["table"] })
  ]);
}

function PermissionDeniedRefresh(): null {
  const client = useQueryClient();
  useEffect(() => subscribePermissionDenied(() => void refreshPermissionQueries(client)), [client]);
  return null;
}

export function AppProviders({ children }: { children: ReactNode }): ReactNode {
  return (
    <ErrorBoundary fallbackMessage="Qyre hit an unexpected error. Retry, or reload the page if it keeps happening.">
      <QueryClientProvider client={queryClient}>
        <PermissionDeniedRefresh />
        {children}
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
