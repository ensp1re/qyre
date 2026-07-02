import type { SchemaMetadata } from "@humb/core";
import { ChevronRight, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { cn } from "../cn.js";

export interface SelectedTable {
  schema: string;
  table: string;
}

export interface SchemaTreeProps {
  schemas: SchemaMetadata[];
  selected?: SelectedTable;
  onSelect: (schema: string, table: string) => void;
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-[color-mix(in_srgb,var(--c-blue)_25%,transparent)] text-inherit">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

/**
 * A searchable, collapsible navigation tree of schemas and their tables. Purely presentational:
 * selection is owned by the caller. Matching a search term force-opens that schema's group and
 * highlights the matched substring (docs/references/design-system.md).
 */
export function SchemaTree({ schemas, selected, onSelect }: SchemaTreeProps): ReactNode {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return schemas;
    return schemas
      .map((schema) => ({
        ...schema,
        tables: schema.tables.filter((table) => table.toLowerCase().includes(q))
      }))
      .filter((schema) => schema.tables.length > 0 || schema.name.toLowerCase().includes(q));
  }, [schemas, query]);

  function toggleSchema(name: string): void {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  return (
    <nav data-testid="schema-tree" className="flex h-full flex-col font-mono text-[12px]">
      <div className="relative shrink-0 px-2 pb-2 pt-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tables..."
          aria-label="Search tables"
          className="w-full rounded-md border border-border bg-input py-1 pl-6 pr-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {filtered.map((schema) => {
          const isOpen = query.trim().length > 0 || !collapsed.has(schema.name);
          return (
            <div key={schema.name} className="mb-1">
              <button
                type="button"
                onClick={() => toggleSchema(schema.name)}
                className="flex w-full items-center gap-1 rounded-md px-1 py-1 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:bg-sidebar-accent"
              >
                <ChevronRight
                  className={cn("h-3 w-3 shrink-0 transition-transform", isOpen && "rotate-90")}
                />
                {highlight(schema.name, query)}
              </button>
              {isOpen && (
                <ul className="m-0 list-none py-0 pl-4">
                  {schema.tables.map((table) => {
                    const isSelected =
                      selected?.schema === schema.name && selected?.table === table;
                    return (
                      <li key={table}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => onSelect(schema.name, table)}
                          className={cn(
                            "block w-full truncate rounded-md px-2 py-1 text-left",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "text-foreground hover:bg-sidebar-accent"
                          )}
                        >
                          {highlight(table, query)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
