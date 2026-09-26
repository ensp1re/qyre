import type { RowSort } from "@qyre/core";

/** Sort by the requested field with `_id` as the final tiebreaker so skip/limit paging is stable. */
export function documentSort(sort?: RowSort): Record<string, 1 | -1> {
  if (!sort) return { _id: 1 };
  const direction = sort.direction === "asc" ? 1 : -1;
  return sort.column === "_id" ? { _id: direction } : { [sort.column]: direction, _id: 1 };
}
