import type { ConnectionStatus } from "@humb/core";
import type { ReactNode } from "react";

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
