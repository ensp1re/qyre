import type { SchemaMetadata } from "@humb/core";
import type { ReactNode } from "react";

export interface SelectedTable {
  schema: string;
  table: string;
}

export interface SchemaTreeProps {
  schemas: SchemaMetadata[];
  selected?: SelectedTable;
  onSelect: (schema: string, table: string) => void;
}

/** A navigation tree of schemas and their tables. Purely presentational: selection is owned by the caller. */
export function SchemaTree({ schemas, selected, onSelect }: SchemaTreeProps): ReactNode {
  return (
    <nav data-testid="schema-tree">
      {schemas.map((schema) => (
        <div key={schema.name} style={{ marginBottom: "1rem" }}>
          <h4
            style={{
              margin: "0 0 0.375rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              textTransform: "uppercase",
              color: "#6b7280"
            }}
          >
            {schema.name}
          </h4>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {schema.tables.map((table) => {
              const isSelected = selected?.schema === schema.name && selected?.table === table;
              return (
                <li key={table}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelect(schema.name, table)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "0.375rem 0.5rem",
                      borderRadius: "0.375rem",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      background: isSelected ? "#111827" : "transparent",
                      color: isSelected ? "#fff" : "#111827"
                    }}
                  >
                    {table}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
