import type { ConnectionStatus } from "@humb/core";
import { Panel, StatusBadge } from "@humb/ui";
import type { ReactNode } from "react";
import { useHealth } from "./hooks/use-health.js";

export function App(): ReactNode {
  const { data, isLoading, isError } = useHealth();

  const status: ConnectionStatus = isError ? "disconnected" : (data?.database ?? "unconfigured");

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "2.5rem 1.25rem" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem"
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700 }}>Humb</h1>
        <StatusBadge status={status} />
      </header>

      <Panel title="Database connection">
        {isLoading ? (
          <p>Checking connection...</p>
        ) : (
          <p data-testid="connection-summary">
            {status === "connected"
              ? `Connected to ${data?.target ?? "the database"}.`
              : "No database is connected yet. Launch Humb with a Postgres URL to get started."}
          </p>
        )}
      </Panel>
    </main>
  );
}
