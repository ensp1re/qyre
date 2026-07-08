import { Calendar, Hash, ToggleLeft, Type } from "lucide-react";
import type { ReactNode } from "react";
import { isDateType } from "../format-cell.js";

export interface TypeIconProps {
  dataType: string;
}

/**
 * Column-kind classification for `ColumnMetadata.dataType`, which is engine-reported text, not a
 * normalized enum: Postgres reports `information_schema` names ("integer", "character varying",
 * "timestamp with time zone"), SQLite reports raw declared types ("INTEGER", "TEXT", "REAL", or
 * "any" - see packages/drivers/sqlite). Prefix-matched case-insensitively so both read the same way.
 * Exported for FilterBar (F072), which orders its operator list by the picked column's kind -
 * reusing this exact classification so the filter flow and the type icons never disagree.
 */
export function classifyColumnKind(
  dataType: string
): "numeric" | "text" | "boolean" | "datetime" | "other" {
  const type = dataType.toLowerCase();
  if (
    type.startsWith("int") ||
    type.startsWith("numeric") ||
    type.startsWith("decimal") ||
    type.startsWith("float") ||
    type.startsWith("double") ||
    type.startsWith("real") ||
    type.startsWith("serial")
  ) {
    return "numeric";
  }
  if (type.startsWith("bool")) return "boolean";
  if (isDateType(dataType)) return "datetime";
  if (
    type.startsWith("char") ||
    type.startsWith("varchar") ||
    type.startsWith("text") ||
    type.startsWith("uuid") ||
    type.startsWith("json")
  ) {
    return "text";
  }
  return "other";
}

/** A small colored icon for a column's data type, matching docs/references/design-system.md's mapping. */
export function TypeIcon({ dataType }: TypeIconProps): ReactNode {
  switch (classifyColumnKind(dataType)) {
    case "numeric":
      return <Hash className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--c-amber)" }} />;
    case "text":
      return <Type className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--c-blue)" }} />;
    case "boolean":
      return <ToggleLeft className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--c-green)" }} />;
    case "datetime":
      return <Calendar className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--c-purple)" }} />;
    default:
      return <Hash className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />;
  }
}
