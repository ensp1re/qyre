import type { TableMetadata } from "@qyre/core";
import type { ReactNode } from "react";
import { TableDetail } from "../structure/table-detail.js";

export interface SchemaGridProps {
  tables: TableMetadata[];
}

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
