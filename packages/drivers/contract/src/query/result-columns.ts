/** Give repeated result column names deterministic suffixes: `id`, `id_2`, `id_3`. */
export function uniqueColumnNames(names: readonly string[]): string[] {
  const taken = new Set(names);
  const seen = new Set<string>();
  return names.map((name) => {
    if (!seen.has(name)) {
      seen.add(name);
      return name;
    }
    let suffix = 2;
    while (taken.has(`${name}_${suffix}`)) suffix += 1;
    const unique = `${name}_${suffix}`;
    taken.add(unique);
    return unique;
  });
}

/** Key positional result rows by column name without letting a repeated name overwrite a value. */
export function keyRowsByColumn(
  names: readonly string[],
  rows: ReadonlyArray<readonly unknown[]>
): { columns: string[]; rows: Array<Record<string, unknown>> } {
  const columns = uniqueColumnNames(names);
  return {
    columns,
    rows: rows.map((values) => {
      const row: Record<string, unknown> = {};
      columns.forEach((column, index) => {
        row[column] = values[index];
      });
      return row;
    })
  };
}
