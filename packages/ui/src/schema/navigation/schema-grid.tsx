import type { TableMetadata } from "@qyre/core";
import type { ReactNode } from "react";
import { TableDetail } from "../structure/table-detail.js";

export interface SchemaGridProps {
  tables: TableMetadata[];
}

/** Full-database overview: every table as a card, reusing TableDetail's column-row pattern. A
 * masonry (CSS multi-column) layout instead of a CSS grid - tables have wildly different column
 * counts, and a grid's shared row height leaves ragged gaps under every shorter card next to a
 * tall one (F146); columns pack each card directly under the shortest one instead. */
export function SchemaGrid({ tables }: SchemaGridProps): ReactNode {
  return (
    <div data-testid="schema-grid" className="gap-3 [column-width:260px]">
      {tables.map((table) => (
        <div key={`${table.schema}.${table.name}`} className="mb-3 break-inside-avoid">
          <TableDetail table={table} />
        </div>
      ))}
    </div>
  );
}
