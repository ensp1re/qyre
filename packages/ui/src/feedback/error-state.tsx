import type { ReactNode } from "react";

export interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps): ReactNode {
  return (
    <div
      data-testid="error-state"
      className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <p className="max-w-md font-mono text-[12px] text-foreground/80">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-[3px] border border-border px-3 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent/50"
      >
        Retry
      </button>
    </div>
  );
}
