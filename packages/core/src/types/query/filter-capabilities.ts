import type { FilterOp } from "./query.js";

export type FilterValueInput =
  "text" | "number" | "boolean" | "date" | "time" | "datetime-local" | "json";

export type FilterColumnKind =
  | "text"
  | "numeric"
  | "boolean"
  | "date"
  | "time"
  | "datetime"
  | "identifier"
  | "objectId"
  | "null"
  | "structured"
  | "binary"
  | "unknown";

export interface FilterCapability {
  readonly kind: FilterColumnKind;
  readonly label: string;
  readonly operators: readonly FilterOp[];
  readonly valueInput: FilterValueInput | null;
  readonly unavailableReason?: string;
}
