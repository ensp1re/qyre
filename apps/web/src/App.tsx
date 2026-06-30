import type { ConnectionStatus } from "@humb/ui";
import { Panel, StatusBadge } from "@humb/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

interface HealthResponse {
  status: string;
  database: ConnectionStatus;
  target: string | null;
}

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}

export function App(): ReactNode {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false
  });

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
