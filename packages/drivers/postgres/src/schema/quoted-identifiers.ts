import type { Pool } from "pg";
import { SYSTEM_SCHEMAS } from "./catalog.js";

function skipSingleQuotedLiteral(sql: string, start: number): number {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === "'") {
      if (sql[index + 1] === "'") {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  return sql.length;
}

function skipDoubleQuotedToken(sql: string, start: number): number {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === '"') {
      if (sql[index + 1] === '"') {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  return sql.length;
}

function matchDollarQuoteTag(sql: string, index: number): string | undefined {
  return /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(index))?.[0];
}

function skipDollarQuotedLiteral(sql: string, start: number, tag: string): number {
  const closeIndex = sql.indexOf(tag, start + tag.length);
  return closeIndex === -1 ? sql.length : closeIndex + tag.length;
}

function maskStringLiterals(sql: string): string {
  let result = "";
  let index = 0;
  while (index < sql.length) {
    if (sql[index] === "'") {
      const end = skipSingleQuotedLiteral(sql, index);
      result += " ".repeat(end - index);
      index = end;
      continue;
    }
    const tag = matchDollarQuoteTag(sql, index);
    if (tag) {
      const end = skipDollarQuotedLiteral(sql, index, tag);
      result += " ".repeat(end - index);
      index = end;
      continue;
    }
    result += sql[index];
    index += 1;
  }
  return result;
}

function collectLocalIdentifiers(sql: string): Set<string> {
  const masked = maskStringLiterals(sql);
  const identifiers = new Set<string>();
  for (const match of masked.matchAll(/"?([A-Za-z_][A-Za-z0-9_]*)"?\s+AS\s*\(/gi)) {
    if (match[1]) identifiers.add(match[1]);
  }
  for (const match of masked.matchAll(/\bAS\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)) {
    if (match[1]) identifiers.add(match[1]);
  }
  return identifiers;
}

/** Coerce only unknown double-quoted tokens to string literals. */
export function coerceUnknownQuotedIdentifiers(
  sql: string,
  knownIdentifiers: ReadonlySet<string>
): string {
  const localIdentifiers = collectLocalIdentifiers(sql);
  let result = "";
  let index = 0;
  while (index < sql.length) {
    if (sql[index] === "'") {
      const end = skipSingleQuotedLiteral(sql, index);
      result += sql.slice(index, end);
      index = end;
      continue;
    }
    const tag = matchDollarQuoteTag(sql, index);
    if (tag) {
      const end = skipDollarQuotedLiteral(sql, index, tag);
      result += sql.slice(index, end);
      index = end;
      continue;
    }
    if (sql[index] === '"') {
      const end = skipDoubleQuotedToken(sql, index);
      const token = sql.slice(index, end);
      const inner = token.slice(1, -1).replace(/""/g, '"');
      result +=
        knownIdentifiers.has(inner) || localIdentifiers.has(inner)
          ? token
          : `'${inner.replace(/'/g, "''")}'`;
      index = end;
      continue;
    }
    result += sql[index];
    index += 1;
  }
  return result;
}

/** Load every real schema, table, and column name for quoted-token coercion. */
export async function fetchKnownIdentifiers(pool: Pool): Promise<Set<string>> {
  const [schemas, tables, columns] = await Promise.all([
    pool.query<{ schema_name: string }>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name <> ALL($1::text[])`,
      [SYSTEM_SCHEMAS]
    ),
    pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema <> ALL($1::text[])`,
      [SYSTEM_SCHEMAS]
    ),
    pool.query<{ column_name: string }>(
      `SELECT DISTINCT column_name FROM information_schema.columns
        WHERE table_schema <> ALL($1::text[])`,
      [SYSTEM_SCHEMAS]
    )
  ]);
  const identifiers = new Set<string>();
  for (const row of schemas.rows) identifiers.add(row.schema_name);
  for (const row of tables.rows) identifiers.add(row.table_name);
  for (const row of columns.rows) identifiers.add(row.column_name);
  return identifiers;
}
