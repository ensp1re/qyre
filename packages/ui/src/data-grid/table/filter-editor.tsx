import type { ColumnMetadata, FilterOp } from "@qyre/core";
import type { ReactNode } from "react";

/** Word + symbol per operator - the popover menu shows the word (readable for newcomers) with the
 * symbol as a muted hint; chips show the symbol (compact, familiar to SQL users). Not imported
 * from @qyre/core's FILTER_OPS - its barrel has Node-only imports that break Vite's browser build
 * the moment a real (non-type) value is imported (see use-rows.ts's UI_PAGE_SIZE comment). */
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

/** In-progress filter being composed or edited. Which popover step renders is derived from what's
 * filled in (no column -> pick column; no op -> pick operator; both -> type the value), so "go
 * back" is just clearing a field and there's no separate step state to keep in sync. */
export interface Draft {
  column?: ColumnMetadata;
  op?: FilterOp;
  value: string;
}

export const EMPTY_DRAFT: Draft = { value: "" };

/** One muted keyboard-hint line at the popover's foot. */
export function HintFooter({ text }: { text: string }): ReactNode {
  return (
    <div className="border-t border-border px-2 py-1 text-[9px] tracking-wide text-quiet-foreground">
      {text}
    </div>
  );
}
