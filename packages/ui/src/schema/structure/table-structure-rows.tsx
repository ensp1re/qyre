import type { ColumnMetadata, IndexMetadata } from "@qyre/core";
import { Link, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { TypeIcon } from "../../primitives/type-icon.js";

export function ColumnRow({
  column,
  bordered,
  editable,
  onEdit,
  onDrop
}: {
  column: ColumnMetadata;
  bordered: boolean;
  editable: boolean;
  onEdit: () => void;
  onDrop: () => void;
}): ReactNode {
  return (
    <div
      className={
        "flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] hover:bg-accent/50" +
        (bordered ? " border-t border-border-subtle" : "")
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
      {editable && (
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit column ${column.name}`}
            className="rounded-[2px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            onClick={onDrop}
            aria-label={`Drop column ${column.name}`}
            className="rounded-[2px] p-1 text-muted-foreground hover:bg-accent"
            style={{ color: "var(--c-red)" }}
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </span>
      )}
    </div>
  );
}

export function IndexRow({
  index,
  canManage,
  dropping,
  onDrop
}: {
  index: IndexMetadata;
  canManage: boolean;
  dropping: boolean;
  onDrop: () => void;
}): ReactNode {
  return (
    <li className="flex items-center gap-2">
      <span>
        {index.name} ({index.columns.join(", ")})
        {index.primary ? " · primary key" : index.unique ? " · unique" : ""}
      </span>
      {canManage && !index.primary && (
        <button
          type="button"
          onClick={onDrop}
          disabled={dropping}
          aria-label={`Drop index ${index.name}`}
          className="ml-auto rounded-[2px] p-1 text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          style={{ color: "var(--c-red)" }}
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      )}
    </li>
  );
}
