import { TypeIcon } from "@qyre/ui";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Link, Table2 } from "lucide-react";
import type { ReactNode } from "react";
import type { TableFlowNode } from "../../model/graph-types.js";

const MAX_VISIBLE_ROWS = 12;

export function TableNode({ data, selected }: NodeProps<TableFlowNode>): ReactNode {
  const { table } = data;
  const capped = table.columns.length > MAX_VISIBLE_ROWS;
  const isHighlighted = data.highlighted || selected;
  const isDimmed = data.dimmed && !selected;

  return (
    <div
      className={
        "w-60 overflow-hidden rounded-[4px] border bg-card shadow-sm transition-[border-color,opacity,box-shadow] " +
        (isHighlighted ? "border-primary shadow-primary/15" : "border-border") +
        (isDimmed ? " opacity-45" : "")
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!border-none !bg-transparent"
      />

      <div
        className={
          "flex items-center gap-2 border-b border-border px-3 py-2 " +
          (isHighlighted ? "bg-primary/10" : "bg-accent/40")
        }
      >
        <Table2 className="h-3 w-3 shrink-0" style={{ color: "var(--c-blue)" }} />
        <span className="truncate font-mono text-[12px] font-medium text-foreground">
          {table.name}
        </span>
        {table.rowCount !== undefined && (
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
            ~{table.rowCount.toLocaleString()}
          </span>
        )}
      </div>

      <div
        className="bg-background"
        style={capped ? { maxHeight: MAX_VISIBLE_ROWS * 24, overflowY: "auto" } : undefined}
      >
        {table.columns.map((column, index) => (
          <div
            key={column.name}
            className={
              "relative flex items-center gap-2 px-3 py-1 font-mono text-[11px]" +
              (index !== 0 ? " border-t border-border-subtle" : "")
            }
          >
            <TypeIcon dataType={column.dataType} />
            <span
              className="truncate"
              style={{
                color: column.isPrimaryKey
                  ? "var(--c-amber)"
                  : column.isForeignKey
                    ? "var(--c-blue)"
                    : "rgb(var(--foreground) / 0.8)"
              }}
            >
              {column.name}
            </span>
            {column.isPrimaryKey && (
              <span className="shrink-0 text-[8px] font-bold" style={{ color: "var(--c-amber)" }}>
                PK
              </span>
            )}
            {column.isForeignKey && (
              <Link className="h-2 w-2 shrink-0" style={{ color: "var(--c-blue)" }} />
            )}
            <span className="ml-auto shrink-0 truncate text-[9px] text-quiet-foreground">
              {column.dataType}
            </span>
            {column.isForeignKey && (
              <Handle
                id={`col-${column.name}`}
                type="source"
                position={Position.Right}
                isConnectable={false}
                className="!border-none !bg-transparent"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
