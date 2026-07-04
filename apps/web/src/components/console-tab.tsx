import { ConsoleLog, ErrorState, Spinner } from "@humbdb/ui";
import type { ReactNode } from "react";
import type { useConsoleEvents } from "../hooks/use-console.js";

export interface ConsoleTabProps {
  consoleEvents: ReturnType<typeof useConsoleEvents>;
  onClear: () => void;
}

/** Console tab content - a stream of recent connection/query events. */
export function ConsoleTab({ consoleEvents, onClear }: ConsoleTabProps): ReactNode {
  if (consoleEvents.isLoading) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Spinner /> Loading console...
      </p>
    );
  }

  if (consoleEvents.isError) {
    return (
      <ErrorState
        message={
          consoleEvents.error instanceof Error
            ? consoleEvents.error.message
            : "Failed to load console events."
        }
        onRetry={() => consoleEvents.refetch()}
      />
    );
  }

  return <ConsoleLog events={consoleEvents.data?.events ?? []} onClear={onClear} />;
}
