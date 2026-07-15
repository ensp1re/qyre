/** Extracts the database name from `health.target`'s redacted display string (F116) - e.g.
 * `"postgres://user:***@host:5432/mydb"` -> `"mydb"`. `target` is already credential-redacted, so
 * parsing it client-side is safe; returns undefined for a non-URL target (SQLite's raw file path)
 * or when nothing is connected yet. */
export function parseTargetDatabase(target: string | null | undefined): string | undefined {
  if (!target) return undefined;
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return undefined;
  }
  const name = url.pathname.replace(/^\//, "");
  return name ? decodeURIComponent(name) : undefined;
}
