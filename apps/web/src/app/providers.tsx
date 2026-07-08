import { ErrorBoundary } from "@qyre/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }): ReactNode {
  return (
    <ErrorBoundary fallbackMessage="Qyre hit an unexpected error. Retry, or reload the page if it keeps happening.">
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ErrorBoundary>
  );
}
