import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./error-state.js";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Message shown above Retry. Defaults to the caught error's own message. */
  fallbackMessage?: string;
}

interface ErrorBoundaryState {
  error: Error | undefined;
}

/**
 * Catches a render error anywhere in its subtree and shows a recoverable {@link ErrorState}
 * instead of letting React unmount the whole tree (a blank page) - the app renders arbitrary
 * database content (JSON, binary blobs, deeply nested BSON), so an unanticipated value is exactly
 * the kind of thing that can throw during render. Logs to the console for diagnosis, same as any
 * other uncaught error would.
 *
 * Retry re-renders the subtree from its current props/state - pair with a `key` prop from the
 * caller (e.g. the active tab) when the crash's cause should be reset too, not just re-attempted.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <ErrorState
          message={this.props.fallbackMessage ?? error.message ?? "Something went wrong."}
          onRetry={() => this.setState({ error: undefined })}
        />
      );
    }
    return this.props.children;
  }
}
