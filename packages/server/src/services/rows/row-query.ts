import type { RowFilter, RowSort, SortDirection, TableMetadata } from "@qyre/core";
import { filterCapabilityForColumn } from "@qyre/core/filter-capabilities";
import type { DatabaseAdapter, ResolvedRowSearch } from "@qyre/driver-contract";

/**
 * Validates a requested sort column against the table's real columns before it's ever used in a
 * query (F065) - this is the actual injection surface `page`/`pageSize` don't have, since a column
 * name is a raw identifier rather than a value Zod can numeric-coerce or a driver can
 * parameter-bind. Throws a 400-shaped error (matching `requireAdapter`'s convention, caught by the
 * global error handler) for an unrecognized column; returns undefined when no sort was requested
 * at all.
 */
export function resolveRowSort(
  tableMetadata: TableMetadata,
  sortColumn: string | undefined,
  sortDirection: SortDirection
): RowSort | undefined {
  if (!sortColumn) return undefined;
  if (!tableMetadata.columns.some((column) => column.name === sortColumn)) {
    throw Object.assign(new Error(`Unknown sort column "${sortColumn}".`), { statusCode: 400 });
  }
  return { column: sortColumn, direction: sortDirection };
}

/**
 * Validates each requested filter's column against the table's real columns before it's ever used
 * in a query (F072) - same injection-surface reasoning as {@link resolveRowSort}'s `sortColumn`.
 * Throws a 400-shaped error naming the first unrecognized column; returns undefined when no
 * filters were requested at all.
 */
export function resolveRowFilters(
  tableMetadata: TableMetadata,
  filters: RowFilter[] | undefined,
  engine?: DatabaseAdapter["engine"]
): RowFilter[] | undefined {
  if (!filters || filters.length === 0) return undefined;
  return filters.map((filter) => {
    const column = tableMetadata.columns.find((candidate) => candidate.name === filter.column);
    if (!column) {
      throw Object.assign(new Error(`Unknown filter column "${filter.column}".`), {
        statusCode: 400
      });
    }
    const capability = filterCapabilityForColumn(column, engine);
    if (!capability.operators.includes(filter.op)) {
      throw Object.assign(
        new Error(
          `Filter operator "${filter.op}" is not supported for column "${filter.column}" (${capability.label}).`
        ),
        { statusCode: 400 }
      );
    }
    if (capability.valueInput === "json" && filter.value !== undefined) {
      let candidate: unknown;
      try {
        candidate = JSON.parse(filter.value);
      } catch {
        throw Object.assign(
          new Error(`Filter value for column "${filter.column}" must be valid JSON.`),
          { statusCode: 400 }
        );
      }
      const type = column.dataType.toLowerCase();
      if ((type.includes("array") || type.endsWith("[]")) && !Array.isArray(candidate)) {
        throw Object.assign(
          new Error(`Filter value for array column "${filter.column}" must be a JSON array.`),
          { statusCode: 400 }
        );
      }
      if (
        engine === "mongodb" &&
        type === "object" &&
        (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      ) {
        throw Object.assign(
          new Error(`Filter value for object column "${filter.column}" must be a JSON object.`),
          { statusCode: 400 }
        );
      }
    }
    return { ...filter, columnDataType: column.dataType };
  });
}

export function resolveRowSearch(
  tableMetadata: TableMetadata,
  search: string | undefined
): ResolvedRowSearch | undefined {
  const value = search?.trim();
  return value ? { value, columns: tableMetadata.columns } : undefined;
}

/**
 * Resolves sort and filters together, sharing a single `getTable` introspection call between them
 * - and skipping that call entirely when neither was requested, matching `resolveRowSort`'s
 * previous lazy behavior (the common unsorted/unfiltered request shouldn't pay for introspection
 * it doesn't need).
 */
export async function resolveRowQuery(
  db: DatabaseAdapter,
  schema: string,
  table: string,
  sortColumn: string | undefined,
  sortDirection: SortDirection,
  filters: RowFilter[] | undefined,
  search?: string
): Promise<{ sort?: RowSort; filters?: RowFilter[]; search?: ResolvedRowSearch }> {
  if (!sortColumn && (!filters || filters.length === 0) && !search?.trim()) return {};
  const tableMetadata = await db.getTable(schema, table);
  return {
    sort: resolveRowSort(tableMetadata, sortColumn, sortDirection),
    filters: resolveRowFilters(tableMetadata, filters, db.engine),
    search: resolveRowSearch(tableMetadata, search)
  };
}
