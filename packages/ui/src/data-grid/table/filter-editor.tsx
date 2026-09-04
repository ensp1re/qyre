import type { ColumnMetadata, FilterOp } from "@qyre/core";
import type { ReactNode } from "react";

export const OP_META: Record<FilterOp, { word: string; symbol: string }> = {
  eq: { word: "equals", symbol: "=" },
  neq: { word: "not equals", symbol: "≠" },
  contains: { word: "contains", symbol: "contains" },
  lt: { word: "less than", symbol: "<" },
  lte: { word: "less or equal", symbol: "≤" },
  gt: { word: "greater than", symbol: ">" },
  gte: { word: "greater or equal", symbol: "≥" },
  isNull: { word: "is null", symbol: "is null" },
  isNotNull: { word: "is not null", symbol: "is not null" }
};

export const NO_VALUE_OPS = new Set<FilterOp>(["isNull", "isNotNull"]);

export interface Draft {
  column?: ColumnMetadata;
  op?: FilterOp;
  value: string;
}

export const EMPTY_DRAFT: Draft = { value: "" };

export function HintFooter({ text }: { text: string }): ReactNode {
  return (
    <div className="border-t border-border px-2 py-1 text-[9px] tracking-wide text-quiet-foreground">
      {text}
    </div>
  );
}
