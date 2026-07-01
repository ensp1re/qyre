import type { ConnectionStatus } from "@humb/core";
import { Panel, SchemaTree, StatusBadge, TableDetail } from "@humb/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { useHealth } from "./hooks/use-health.js";
import { useOverview } from "./hooks/use-overview.js";
import { useTable } from "./hooks/use-table.js";

export function App(): ReactNode {
  const { data: health, isLoading: healthLoading, isError: healthError } = useHealth();
  const status: ConnectionStatus = healthError
    ? "disconnected"
    : (health?.database ?? "unconfigured");

  const [selected, setSelected] = useState<{ schema: string; table: string } | undefined>();
  const overview = useOverview({ enabled: status === "connected" });
  const table = useTable(selected?.schema, selected?.table);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "2.5rem 1.25rem" }}>
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
        {healthLoading ? (
          <p>Checking connection...</p>
        ) : (
          <p data-testid="connection-summary">
            {status === "connected"
              ? `Connected to ${health?.target ?? "the database"}.`
              : "No database is connected yet. Launch Humb with a Postgres URL to get started."}
          </p>
        )}
      </Panel>

      {status === "connected" && (
        <div style={{ display: "flex", gap: "1.5rem", marginTop: "1.5rem" }}>
          <div style={{ flex: "0 0 220px" }}>
            <Panel title="Schemas & tables">
              {overview.isLoading ? (
                <p>Loading schemas...</p>
              ) : overview.isError ? (
                <p>
                  Failed to load schemas.{" "}
                  <button type="button" onClick={() => overview.refetch()}>
                    Retry
                  </button>
                </p>
              ) : overview.data && overview.data.schemas.length > 0 ? (
                <SchemaTree
                  schemas={overview.data.schemas}
                  selected={selected}
                  onSelect={(schema, tableName) => setSelected({ schema, table: tableName })}
                />
              ) : (
                <p>No tables found.</p>
              )}
            </Panel>
          </div>

          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <Panel title={selected ? `${selected.schema}.${selected.table}` : "Table details"}>
              {!selected ? (
                <p>Select a table to see its columns.</p>
              ) : table.isLoading ? (
                <p>Loading table...</p>
              ) : table.isError ? (
                <p>
                  Failed to load table metadata.{" "}
                  <button type="button" onClick={() => table.refetch()}>
                    Retry
                  </button>
                </p>
              ) : table.data ? (
                <TableDetail table={table.data} />
              ) : null}
            </Panel>
          </div>
        </div>
      )}
    </main>
  );
}
