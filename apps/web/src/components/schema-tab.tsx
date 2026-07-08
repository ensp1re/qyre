import { ErrorState, SchemaGrid, Spinner } from "@qyre/ui";
import { LayoutGrid, Network } from "lucide-react";
import type { ReactNode } from "react";
import type { useAllTables } from "../hooks/use-all-tables.js";
import { useSchemaView } from "../hooks/use-schema-view.js";
import { SchemaGraph } from "./schema-graph/schema-graph.js";

export interface SchemaTabProps {
  allTables: ReturnType<typeof useAllTables>;
  /** Stable per-database key (the redacted connection target) so the graph's saved layout is
   * namespaced per database. Null before a connection exists - the tab shows loading/empty then. */
  databaseKey: string | null;
}

/** Schema tab content - an interactive ERD (F074) or the full-database card grid, toggleable. */
export function SchemaTab({ allTables, databaseKey }: SchemaTabProps): ReactNode {
  const { view, setView } = useSchemaView();

  if (allTables.isLoading) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Spinner /> Loading tables...
      </p>
    );
  }

  if (allTables.isError) {
    return (
      <ErrorState
        message={allTables.error?.message ?? "Failed to load one or more tables."}
        onRetry={() => allTables.refetch()}
      />
    );
  }

  if (allTables.tables.length === 0) {
    return <p className="text-[13px] text-muted-foreground">No tables found.</p>;
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
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "flex items-center gap-1 rounded-[2px] px-2 py-1 font-mono text-[11px] transition-colors " +
        (active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")
      }
    >
      {icon}
      {label}
    </button>
  );
}
