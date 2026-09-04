import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./error-state.js";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackMessage?: string;
}

interface ErrorBoundaryState {
  error: Error | undefined;
}

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
