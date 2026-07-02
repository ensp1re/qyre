import type { TableMetadata } from "@humbdb/core";
import type { ReactNode } from "react";
import { TableDetail } from "./table-detail.js";

export interface SchemaGridProps {
  tables: TableMetadata[];
}

/** Full-database overview: every table as a card, reusing TableDetail's column-row pattern. */
export function SchemaGrid({ tables }: SchemaGridProps): ReactNode {
  return (
    <div
      data-testid="schema-grid"
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
    >
      {tables.map((table) => (
        <TableDetail key={`${table.schema}.${table.name}`} table={table} />
      ))}
    </div>
  );
}
