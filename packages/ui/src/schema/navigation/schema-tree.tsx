import type { SchemaMetadata } from "@qyre/core";
import { FolderOpen, Plus, Search, Table2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { cn } from "../../cn.js";
import type { SelectedTable } from "../types.js";

export type { SelectedTable } from "../types.js";

export interface SchemaTreeProps {
  schemas: SchemaMetadata[];
  selected?: SelectedTable;
  onSelect: (schema: string, table: string) => void;
  canManageSchemas?: boolean;
  onRequestCreateSchema?: () => void;
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
  onRequestDropSchema,
  initialTabStop
}: {
  node: Node;
  depth: number;
  query: string;
  matchIds: Set<string>;
  selected?: SelectedTable;
  onSelect: (schema: string, table: string) => void;
  canManageSchemas?: boolean;
  onRequestDropSchema?: (schema: string) => void;
  initialTabStop?: boolean;
}): ReactNode {
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
        tabIndex={isSelected || initialTabStop ? 0 : -1}
        aria-expanded={hasChildren ? open : undefined}
        aria-selected={node.type === "table" ? isSelected : undefined}
        aria-level={depth + 1}
        className={cn(
          "group relative mx-1 flex h-6 cursor-pointer select-none items-center gap-1 rounded-none pr-1.5 outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary",
          depth > 0 &&
            "before:absolute before:left-[17px] before:top-1/2 before:w-1.5 before:border-t before:border-sidebar-border before:content-['']",
          isSelected &&
            "bg-sidebar-accent text-foreground shadow-[inset_2px_0_0_rgb(var(--primary))]"
        )}
        style={{ paddingLeft: `${6 + depth * 12}px` }}
        onClick={activate}
        onFocus={(event) => {
          const tree = event.currentTarget.closest('[role="tree"]');
          tree?.querySelectorAll<HTMLElement>('[role="treeitem"]').forEach((item) => {
            item.tabIndex = item === event.currentTarget ? 0 : -1;
          });
        }}
        onKeyDown={(event) => {
          const tree = event.currentTarget.closest('[role="tree"]');
          const items = tree
            ? Array.from(tree.querySelectorAll<HTMLElement>('[role="treeitem"]'))
            : [];
          const current = items.indexOf(event.currentTarget);
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : event.key === "ArrowDown"
                    ? Math.min(current + 1, items.length - 1)
                    : Math.max(current - 1, 0);
            items[next]?.focus();
          } else if (event.key === "Enter" || event.key === " ") {
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
          <FolderOpen
            className="h-3 w-3 shrink-0"
            strokeWidth={1.8}
            style={{ color: "var(--c-amber)" }}
          />
        )}
        {node.type === "table" && (
          <Table2 className="h-[11px] w-[11px] shrink-0 text-muted-foreground" strokeWidth={1.8} />
        )}

        <span
          title={node.name}
          className={cn(
            "min-w-0 truncate font-mono text-[11px]",
            node.type === "schema" ? "font-medium text-foreground" : "text-muted-foreground",
            isSelected && "text-foreground"
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
            className="shrink-0 rounded-[2px] p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent focus-visible:opacity-100 group-hover:opacity-100"
            style={{ color: "var(--c-red)" }}
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        )}
      </div>

      {hasChildren && open && (
        <div
          role="group"
          className="relative before:absolute before:bottom-3 before:left-[17px] before:top-0 before:w-px before:bg-sidebar-border"
        >
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
              initialTabStop={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
      <div className="shrink-0 border-b border-border">
        <div className="flex h-7 items-center px-2.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-quiet-foreground">
            Explorer
          </span>
          {canManageSchemas && onRequestCreateSchema && (
            <button
              type="button"
              onClick={onRequestCreateSchema}
              aria-label="New schema"
              title="New schema"
              className="ml-auto rounded-[3px] p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <Plus className="h-3 w-3" strokeWidth={1.8} />
            </button>
          )}
        </div>
        <div
          data-focus-surface
          className="mx-2 mb-2 flex h-7 items-center gap-1.5 rounded-[3px] bg-background px-2 transition-colors focus-within:bg-sidebar-accent focus-within:shadow-[inset_2px_0_0_rgb(var(--primary))]"
        >
          <Search className="h-3 w-3 shrink-0 text-quiet-foreground" strokeWidth={1.8} />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tables, schemas..."
            aria-label="Search tables"
            className="w-full min-w-0 bg-transparent text-[11px] text-foreground outline-none placeholder:text-quiet-foreground"
          />
        </div>
      </div>

      {(() => {
        const hasRows =
          schemaNodes.length > 0 &&
          trimmedQuery.length !== 1 &&
          !(trimmedQuery.length > 1 && matchIds.size === 0);

        // Status messages are not tree content, so omit the tree role when rows are absent.
        return (
          <nav
            role={hasRows ? "tree" : undefined}
            aria-label={hasRows ? "Database objects" : undefined}
            className="flex-1 overflow-y-auto py-1"
          >
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
              schemaNodes.map((node, index) => (
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
                  initialTabStop={index === 0 && (!selected || trimmedQuery.length > 1)}
                />
              ))
            )}
          </nav>
        );
      })()}
    </div>
  );
}
