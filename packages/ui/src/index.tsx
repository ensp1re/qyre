/**
 * Reusable, presentation-only UI components for Humb.
 *
 * This package must not fetch data or import server/adapter packages. See FRONTEND.md.
 */
import type { ReactNode } from "react";

export type ConnectionStatus = "connected" | "disconnected" | "unconfigured";

export interface StatusBadgeProps {
  status: ConnectionStatus;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  unconfigured: "No database"
};

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: "#16a34a",
  disconnected: "#dc2626",
  unconfigured: "#6b7280"
};

/** A small colored badge that communicates database connection status. */
export function StatusBadge({ status }: StatusBadgeProps): ReactNode {
  return (
    <span
      data-testid="status-badge"
      data-status={status}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.25rem 0.625rem",
        borderRadius: "9999px",
        fontSize: "0.875rem",
        fontWeight: 500,
        color: "#fff",
        backgroundColor: STATUS_COLOR[status]
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export interface PanelProps {
  title: string;
  children?: ReactNode;
}

/** A simple titled container used to group content. */
export function Panel({ title, children }: PanelProps): ReactNode {
  return (
    <section
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "0.75rem",
        padding: "1rem 1.25rem",
        background: "#fff"
      }}
    >
      <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem", fontWeight: 600 }}>{title}</h2>
      {children}
    </section>
  );
}
