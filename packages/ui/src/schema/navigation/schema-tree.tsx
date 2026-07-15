import type { SchemaMetadata } from "@qyre/core";
import { FolderOpen, Plus, Table2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { cn } from "../../cn.js";

export interface SelectedTable {
  schema: string;
  table: string;
}

export interface SchemaTreeProps {
  schemas: SchemaMetadata[];
  selected?: SelectedTable;
  onSelect: (schema: string, table: string) => void;
  /** Whether schema create/drop controls render at all (F116, Postgres only - MySQL's "schema" IS
   * its database, SQLite/MongoDB have no schema concept below the database). */
  canManageSchemas?: boolean;
  /** Opens the caller's create-schema flow - a "+ New schema" row above the search box. */
  onRequestCreateSchema?: () => void;
  /** Opens the caller's drop-schema flow for one schema - a trash icon on that schema's row. */
  onRequestDropSchema?: (schema: string) => void;
}

type NodeType = "schema" | "table";

interface Node {
  id: string;
  name: string;
  type: NodeType;
  schema?: string;
  children?: Node[];
}

function buildSchemaNodes(schemas: SchemaMetadata[]): Node[] {
  return schemas.map((schema) => ({
    id: `schema:${schema.name}`,
    name: schema.name,
    type: "schema",
    children: schema.tables.map((table) => ({
      id: `table:${schema.name}:${table}`,
      name: table,
      type: "table",
      schema: schema.name
    }))
  }));
}

function collectMatchIds(node: Node, query: string, ancestors: string[] = []): Set<string> {
  const result = new Set<string>();
  const path = [...ancestors, node.id];
  if (node.name.toLowerCase().includes(query.toLowerCase())) {
    for (const id of path) result.add(id);
  }
  for (const child of node.children ?? []) {
    for (const id of collectMatchIds(child, query, path)) result.add(id);
  }
  return result;
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-[1px] bg-[color-mix(in_srgb,var(--c-blue)_25%,transparent)] text-[var(--c-blue)]">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

function TreeRow({
  node,
  depth,
  query,
  matchIds,
  selected,
  onSelect,
  canManageSchemas,
  onRequestDropSchema
}: {
  node: Node;
  depth: number;
  query: string;
  matchIds: Set<string>;
  selected?: SelectedTable;
  onSelect: (schema: string, table: string) => void;
  canManageSchemas?: boolean;
  onRequestDropSchema?: (schema: string) => void;
}): ReactNode {
  // Only the schema level (depth 0) has children, so it's the only row whose default-open state
  // matters - tables are leaves and always render once their parent schema is expanded.
  const [manualOpen, setManualOpen] = useState(depth === 0);
  const forceOpen = query.length > 0 && matchIds.has(node.id);
  const open = query.length > 0 ? forceOpen : manualOpen;

  if (query.length > 0 && !matchIds.has(node.id)) return null;

  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isSelected =
    node.type === "table" && selected?.schema === node.schema && selected?.table === node.name;

  function activate(): void {
    if (hasChildren) setManualOpen((current) => !current);
    if (node.type === "table" && node.schema) onSelect(node.schema, node.name);
  }

  return (
    <div>
      <div
        role="treeitem"
        tabIndex={0}
        aria-expanded={hasChildren ? open : undefined}
        aria-selected={node.type === "table" ? isSelected : undefined}
        aria-level={depth + 1}
        className={cn(
          "mx-1 flex cursor-pointer select-none items-center gap-1.5 rounded-[2px] py-[3px] pr-2 outline-none hover:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-ring",
          isSelected && "bg-primary/10"
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={activate}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activate();
          } else if (event.key === "ArrowRight" && hasChildren && !open) {
            event.preventDefault();
            setManualOpen(true);
          } else if (event.key === "ArrowLeft" && hasChildren && open) {
            event.preventDefault();
            setManualOpen(false);
          }
        }}
      >
        {hasChildren ? (
          <svg
            viewBox="0 0 24 24"
            className={cn(
              "h-2.5 w-2.5 shrink-0 text-quiet-foreground transition-transform",
              open && "rotate-90"
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="w-2.5 shrink-0" />
        )}

        {node.type === "schema" && (
          <FolderOpen className="h-3 w-3 shrink-0" style={{ color: "var(--c-amber)" }} />
        )}
        {node.type === "table" && <Table2 className="h-3 w-3 shrink-0 text-muted-foreground" />}

        <span
          className={cn(
            "truncate font-mono text-[11px] text-foreground/70",
            isSelected ? "text-foreground" : "hover:text-foreground"
          )}
        >
          {highlight(node.name, query)}
        </span>

        {node.type === "schema" && node.children && (
          <span className="ml-auto shrink-0 font-mono text-[10px] text-quiet-foreground">
            {node.children.length}
          </span>
        )}

        {node.type === "schema" && canManageSchemas && onRequestDropSchema && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRequestDropSchema(node.name);
            }}
            aria-label={`Drop schema ${node.name}`}
            className="shrink-0 rounded-[2px] p-0.5 text-muted-foreground hover:bg-sidebar-accent"
            style={{ color: "var(--c-red)" }}
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        )}
      </div>

      {hasChildren && open && (
        <div role="group">
          {node.children?.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              query={query}
              matchIds={matchIds}
              selected={selected}
              onSelect={onSelect}
              canManageSchemas={canManageSchemas}
              onRequestDropSchema={onRequestDropSchema}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A searchable, collapsible navigation tree: schema -> table, mirroring
 * docs/references/design-system.md's TreeNode pattern. Purely presentational: selection is owned
 * by the caller. Matching a search term force-opens its ancestor path and highlights the match.
 *
 * Neither the connection target string nor a status indicator render here - both are already
 * available (Settings' Connection section, the switch-database drawer, the footer's database
 * name) without repeating the full connection string in this always-visible rail (F087).
 */
export function SchemaTree({
  schemas,
  selected,
  onSelect,
  canManageSchemas,
  onRequestCreateSchema,
  onRequestDropSchema
}: SchemaTreeProps): ReactNode {
  const [query, setQuery] = useState("");
  const schemaNodes = useMemo(() => buildSchemaNodes(schemas), [schemas]);
  const matchIds = useMemo(() => {
    if (query.trim().length <= 1) return new Set<string>();
    const trimmed = query.trim();
    const merged = new Set<string>();
    for (const node of schemaNodes) {
      for (const id of collectMatchIds(node, trimmed)) merged.add(id);
    }
    return merged;
  }, [schemaNodes, query]);
  const trimmedQuery = query.trim();

  return (
    <div data-testid="schema-tree" className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-2 py-2">
        <div className="flex items-center gap-1.5 rounded-[3px] border border-border bg-background px-2 py-1.5">
          <svg
            viewBox="0 0 24 24"
            className="h-2.5 w-2.5 shrink-0 text-quiet-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tables, schemas..."
            aria-label="Search tables"
            className="w-full min-w-0 bg-transparent font-mono text-[11px] text-foreground outline-none placeholder:text-quiet-foreground"
          />
        </div>
        {canManageSchemas && onRequestCreateSchema && (
          <button
            type="button"
            onClick={onRequestCreateSchema}
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-[2px] py-1 font-mono text-[10px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> New schema
          </button>
        )}
      </div>

      {(() => {
        const hasRows =
          schemaNodes.length > 0 &&
          trimmedQuery.length !== 1 &&
          !(trimmedQuery.length > 1 && matchIds.size === 0);

        // `role="tree"` requires at least one `treeitem`/`group` descendant (axe's
        // aria-required-children) - only apply it when rows actually render, otherwise these are
        // plain status messages, not an empty tree widget.
        return (
          <nav role={hasRows ? "tree" : undefined} className="flex-1 overflow-y-auto py-1">
            {schemaNodes.length === 0 ? (
              <div className="px-3 py-4 text-center font-mono text-[11px] text-quiet-foreground">
                No tables found.
              </div>
            ) : trimmedQuery.length === 1 ? (
              <div className="px-3 py-4 text-center font-mono text-[11px] text-quiet-foreground">
                keep typing - search needs 2+ characters
              </div>
            ) : trimmedQuery.length > 1 && matchIds.size === 0 ? (
              <div className="px-3 py-4 text-center font-mono text-[11px] text-quiet-foreground">
                no results
              </div>
            ) : (
              schemaNodes.map((node) => (
                <TreeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  query={trimmedQuery.length > 1 ? trimmedQuery : ""}
                  matchIds={matchIds}
                  selected={selected}
                  onSelect={onSelect}
                  canManageSchemas={canManageSchemas}
                  onRequestDropSchema={onRequestDropSchema}
                />
              ))
            )}
          </nav>
        );
      })()}
    </div>
  );
}
