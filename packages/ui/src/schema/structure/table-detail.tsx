import type { TableKind, TableMetadata } from "@qyre/core";
import { Link, Table2 } from "lucide-react";
import type { ReactNode } from "react";
import { TypeIcon } from "../../primitives/type-icon.js";

export interface TableDetailProps {
  table: TableMetadata;
}

// "table" and "collection" are each their engine's unremarkable default (F124) - a badge only
// flags the exceptional, read-only-in-the-future cases, matching the spec's "subtle" ask rather
// than labeling every single card with its (usually obvious) kind.
const KIND_BADGE_LABEL: Partial<Record<TableKind, string>> = {
  view: "VIEW",
  "materialized-view": "MATERIALIZED VIEW"
};

/**
 * Columns, primary key, indexes, and approximate row count for a single table. Also reused as
 * each card in `SchemaGrid`, the Schema tab's full-database overview.
 */
export function TableDetail({ table }: TableDetailProps): ReactNode {
  return (
    <div
      data-testid="table-detail"
      className="max-w-xl overflow-hidden rounded-[3px] border border-border"
    >
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Table2 className="h-3 w-3 shrink-0" style={{ color: "var(--c-blue)" }} />
        <span className="font-mono text-[12px] font-medium text-foreground">{table.name}</span>
        {KIND_BADGE_LABEL[table.kind] && (
          <span
            data-testid="table-kind-badge"
            className="rounded-[2px] border border-border px-1 text-[8px] tracking-wide text-muted-foreground"
          >
            {KIND_BADGE_LABEL[table.kind]}
          </span>
        )}
        {table.rowCount !== undefined && (
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            ~{table.rowCount.toLocaleString()} row{table.rowCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="bg-background">
        {table.columns.map((column, index) => (
          <div
            key={column.name}
            className={
              "flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] hover:bg-accent/50" +
              (index !== 0 ? " border-t border-border-subtle" : "")
            }
          >
            <TypeIcon dataType={column.dataType} />
            <span
              className={column.isPrimaryKey || column.isForeignKey ? "" : "text-foreground/80"}
              style={{
                color: column.isPrimaryKey
                  ? "var(--c-amber)"
                  : column.isForeignKey
                    ? "var(--c-blue)"
                    : undefined
              }}
            >
              {column.name}
            </span>
            {column.isPrimaryKey && (
              <span
                className="rounded-[2px] border px-1 text-[8px]"
                style={{
                  color: "var(--c-amber)",
                  borderColor: "color-mix(in srgb, var(--c-amber) 30%, transparent)"
                }}
              >
                PK
              </span>
            )}
            {column.isForeignKey && (
              <span
                className="flex items-center gap-0.5 rounded-[2px] border px-1 text-[8px]"
                style={{
                  color: "var(--c-blue)",
                  borderColor: "color-mix(in srgb, var(--c-blue) 30%, transparent)"
                }}
              >
                <Link className="h-2 w-2" />
                FK
              </span>
            )}
            <span className="ml-auto text-[9px] text-quiet-foreground">{column.dataType}</span>
            {column.nullable && <span className="text-[9px] text-quiet-foreground">null</span>}
          </div>
        ))}
      </div>

      {table.indexes && table.indexes.length > 0 && (
        <div className="border-t border-border bg-card px-3 py-2">
          <ul className="space-y-0.5 font-mono text-[10px] text-muted-foreground">
            {table.indexes.map((index) => (
              <li key={index.name}>
                {index.name} ({index.columns.join(", ")})
                {index.primary ? " · primary key" : index.unique ? " · unique" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
