import type { ConnectionCapabilities, SchemaMetadata } from "@qyre/core";
import { CreateTableDialog, ErrorState, SchemaGrid, Spinner } from "@qyre/ui";
import { LayoutGrid, Network, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { SchemaGraph } from "./graph/schema-graph.js";
import type { useAllTables } from "../model/use-all-tables.js";
import { useCreateTable } from "../model/use-create-table.js";
import { useSchemaView } from "../model/use-schema-view.js";
import { sessionAllows } from "../../../shared/lib/capabilities/capability-gates.js";
import { columnTypeCatalogForEngine } from "../../../shared/lib/ddl/column-type-catalog.js";
import { ViewButton } from "../../../shared/ui/view-button.js";

export interface SchemaTabProps {
  allTables: ReturnType<typeof useAllTables>;
  /** Stable per-database key (the redacted connection target) so the graph's saved layout is
   * namespaced per database. Null before a connection exists - the tab shows loading/empty then. */
  databaseKey: string | null;
  schemas: SchemaMetadata[];
  engine: string | undefined;
  capabilities: ConnectionCapabilities | undefined;
}

/** Schema tab content - an interactive ERD (F074) or the full-database card grid, toggleable, plus
 * the F113 "New table" entry point when the session's `supportsDdl` capability allows it. */
export function SchemaTab({
  allTables,
  databaseKey,
  schemas,
  engine,
  capabilities
}: SchemaTabProps): ReactNode {
  const { view, setView } = useSchemaView();
  const [dialogOpen, setDialogOpen] = useState(false);
  const targetSchema = schemas[0]?.name ?? "";
  const createTableMutation = useCreateTable(targetSchema);
  const canCreateTable = sessionAllows(capabilities, "supportsDdl");

  const dialog = dialogOpen && (
    <CreateTableDialog
      schema={targetSchema}
      columnTypes={columnTypeCatalogForEngine(engine)}
      creating={createTableMutation.isPending}
      error={createTableMutation.error?.message}
      onCreate={(table, columns) => {
        createTableMutation.mutate({ table, columns }, { onSuccess: () => setDialogOpen(false) });
      }}
      onClose={() => setDialogOpen(false)}
    />
  );

  const newTableButton = canCreateTable && (
    <button
      type="button"
      onClick={() => setDialogOpen(true)}
      className="ml-auto flex items-center gap-1 rounded-[3px] border border-border bg-card px-2 py-1 font-mono text-[11px] text-foreground hover:bg-accent"
    >
      <Plus className="h-3 w-3" /> New table
    </button>
  );

  if (allTables.isLoading) {
    return (
      <>
        <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Spinner /> Loading tables...
        </p>
        {dialog}
      </>
    );
  }

  if (allTables.isError) {
    return (
      <>
        <ErrorState
          message={allTables.error?.message ?? "Failed to load one or more tables."}
          onRetry={() => allTables.refetch()}
        />
        {dialog}
      </>
    );
  }

  if (allTables.tables.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-1 pb-3">{newTableButton}</div>
        <p className="text-[13px] text-muted-foreground">No tables found.</p>
        {dialog}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 pb-3">
        <div className="flex items-center gap-0.5 rounded-[3px] border border-border bg-card p-0.5">
          <ViewButton
            active={view === "graph"}
            onClick={() => setView("graph")}
            icon={<Network className="h-3 w-3" />}
            label="Graph"
          />
          <ViewButton
            active={view === "grid"}
            onClick={() => setView("grid")}
            icon={<LayoutGrid className="h-3 w-3" />}
            label="Grid"
          />
        </div>
        {newTableButton}
      </div>

      <div className="min-h-0 flex-1">
        {view === "graph" ? (
          <SchemaGraph tables={allTables.tables} databaseKey={databaseKey ?? "unknown"} />
        ) : (
          <div className="h-full overflow-auto">
            <SchemaGrid tables={allTables.tables} />
          </div>
        )}
      </div>
      {dialog}
    </div>
  );
}
