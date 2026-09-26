import type { RowSort } from "@qyre/core";

/** The user's sort followed by the row key ascending, so rows that tie on the sort (or every row,
 * without one) keep one total order and offset pages neither repeat nor skip rows. Without a key
 * the order is only the user's sort. */
export function resolveRowOrder(
  sort: RowSort | undefined,
  keyColumns: readonly string[]
): RowSort[] {
  const order: RowSort[] = sort ? [sort] : [];
  for (const column of keyColumns) {
    if (!order.some((entry) => entry.column === column)) order.push({ column, direction: "asc" });
  }
  return order;
}

/** Render a resolved row order as an ORDER BY clause with the engine's identifier quoting. */
export function buildOrderByClause(
  order: readonly RowSort[],
  quoteIdent: (name: string) => string
): string {
  if (order.length === 0) return "";
  return ` ORDER BY ${order
    .map(({ column, direction }) => `${quoteIdent(column)} ${direction === "asc" ? "ASC" : "DESC"}`)
    .join(", ")}`;
}
