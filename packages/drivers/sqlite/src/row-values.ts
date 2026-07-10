/**
 * Preserve SQLite integers exactly while keeping JSON-safe values. Safe BigInts remain numbers;
 * larger values match the Postgres/MySQL convention and become strings.
 */
export function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "bigint") {
      normalized[key] =
        value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
          ? Number(value)
          : value.toString();
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}
