import type { ConnectionStatus, SchemaMetadata } from "@humbdb/core";
import { Circle, FolderOpen, Table2 } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { cn } from "../cn.js";

export interface SelectedTable {
  schema: string;
  table: string;
}

export interface SchemaTreeProps {
  target: string | null;
  status: ConnectionStatus;
  schemas: SchemaMetadata[];
  selected?: SelectedTable;
  onSelect: (schema: string, table: string) => void;
}

type NodeType = "connection" | "schema" | "table";

interface Node {
  id: string;
  name: string;
  type: NodeType;
  schema?: string;
  children?: Node[];
}

const STATUS_DOT_COLOR: Record<ConnectionStatus, string> = {
  connected: "var(--c-green)",
  disconnected: "var(--c-red)",
  unconfigured: "rgb(var(--muted-foreground))"
};

function buildTree(target: string | null, schemas: SchemaMetadata[]): Node {
  return {
    id: "connection",
    name: target ?? "not connected",
    type: "connection",
    children: schemas.map((schema) => ({
      id: `schema:${schema.name}`,
      name: schema.name,
      type: "schema",
      children: schema.tables.map((table) => ({
        id: `table:${schema.name}:${table}`,
        name: table,
        type: "table",
        schema: schema.name
      }))
    }))
  };
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
  status
}: {
  node: Node;
  depth: number;
  query: string;
  matchIds: Set<string>;
  selected?: SelectedTable;
  onSelect: (schema: string, table: string) => void;
  status: ConnectionStatus;
}): ReactNode {
  const [manualOpen, setManualOpen] = useState(depth < 2);
  const forceOpen = query.length > 0 && matchIds.has(node.id);
  const open = query.length > 0 ? forceOpen : manualOpen;

  if (query.length > 0 && !matchIds.has(node.id)) return null;

  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isSelected =
    node.type === "table" && selected?.schema === node.schema && selected?.table === node.name;

  return (
    <div>
      <div
        role={node.type === "table" ? "button" : undefined}
        aria-pressed={node.type === "table" ? isSelected : undefined}
        className={cn(
          "mx-1 flex cursor-pointer select-none items-center gap-1.5 rounded-[2px] py-[3px] pr-2 hover:bg-sidebar-accent",
          isSelected && "bg-primary/10"
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          if (hasChildren) setManualOpen((current) => !current);
          if (node.type === "table" && node.schema) onSelect(node.schema, node.name);
        }}
      >
        {hasChildren ? (
          <svg
            viewBox="0 0 24 24"
            className={cn(
              "h-2.5 w-2.5 shrink-0 text-muted-foreground/60 transition-transform",
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

        {node.type === "connection" && (
          <Circle
            className="h-1.5 w-1.5 shrink-0"
            fill={STATUS_DOT_COLOR[status]}
            style={{ color: STATUS_DOT_COLOR[status] }}
          />
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
      </div>

      {hasChildren && open && (
        <div>
          {node.children?.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              query={query}
              matchIds={matchIds}
              selected={selected}
              onSelect={onSelect}
              status={status}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A searchable, collapsible navigation tree: connection -> schema -> table, mirroring
 * docs/references/design-system.md's TreeNode pattern. Purely presentational: selection is owned
 * by the caller. Matching a search term force-opens its ancestor path and highlights the match.
 */
export function SchemaTree({
  target,
  status,
  schemas,
  selected,
  onSelect
}: SchemaTreeProps): ReactNode {
  const [query, setQuery] = useState("");
  const tree = useMemo(() => buildTree(target, schemas), [target, schemas]);
  const matchIds = useMemo(
    () => (query.trim().length > 1 ? collectMatchIds(tree, query.trim()) : new Set<string>()),
    [tree, query]
  );
  const trimmedQuery = query.trim();

  return (
    <div data-testid="schema-tree" className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-2 py-2">
        <div className="flex items-center gap-1.5 rounded-[3px] border border-border bg-background px-2 py-1.5">
          <svg
            viewBox="0 0 24 24"
            className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50"
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
            className="w-full min-w-0 bg-transparent font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-1">
        {trimmedQuery.length > 1 && matchIds.size === 0 ? (
          <div className="px-3 py-4 text-center font-mono text-[11px] text-muted-foreground/40">
            no results
          </div>
        ) : (
          <TreeRow
            node={tree}
            depth={0}
            query={trimmedQuery.length > 1 ? trimmedQuery : ""}
            matchIds={matchIds}
            selected={selected}
            onSelect={onSelect}
            status={status}
          />
        )}
      </nav>
    </div>
  );
}
