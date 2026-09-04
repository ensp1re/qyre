import type { TableKind } from "@qyre/core";

export const TABLE_KIND_LABELS: Partial<Record<TableKind, string>> = {
  view: "VIEW",
  "materialized-view": "MATERIALIZED VIEW"
};
