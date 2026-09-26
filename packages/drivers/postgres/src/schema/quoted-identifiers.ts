import { maskSql, scanSql } from "@qyre/driver-contract";
import type { Pool } from "pg";
import { SYSTEM_SCHEMAS } from "./catalog.js";

// Right after a comparison operator or LIKE, a double-quoted token is being used as a value.
const VALUE_OPERATOR_BEFORE = /(?:[=<>]|\b(?:i?like))\s*$/i;

function collectLocalIdentifiers(sql: string): Set<string> {
  const masked = maskSql(sql, "postgres", ["comment", "string"]);
  const identifiers = new Set<string>();
  for (const match of masked.matchAll(/"?([A-Za-z_][A-Za-z0-9_]*)"?\s+AS\s*\(/gi)) {
    if (match[1]) identifiers.add(match[1]);
  }
  for (const match of masked.matchAll(/\bAS\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)) {
    if (match[1]) identifiers.add(match[1]);
  }
  return identifiers;
}

/** True when the open paren enclosing `end` belongs to an `IN (...)` list. */
function isInsideInList(code: string, end: number): boolean {
  let depth = 0;
  for (let index = end - 1; index >= 0; index -= 1) {
    const char = code[index];
    if (char === ")") depth += 1;
    else if (char === "(") {
      if (depth === 0) return /\bin\s*$/i.test(code.slice(0, index));
      depth -= 1;
    }
  }
  return false;
}

function isValuePosition(code: string, start: number, end: number): boolean {
  const before = code.slice(0, start);
  if (/\.\s*$/.test(before) || /^\s*\./.test(code.slice(end))) return false;
  if (VALUE_OPERATOR_BEFORE.test(before)) return true;
  return /[(,]\s*$/.test(before) && isInsideInList(code, start);
}

/**
 * Coerce an unknown double-quoted token to a string literal only where a value is expected
 * (`col = "x"`, `col LIKE "x%"`, `col IN ("a", "b")`); identifier positions are never rewritten.
 */
export function coerceUnknownQuotedIdentifiers(
  sql: string,
  knownIdentifiers: ReadonlySet<string>
): string {
  const localIdentifiers = collectLocalIdentifiers(sql);
  const code = maskSql(sql, "postgres", ["comment", "string", "identifier"]);
  let result = "";
  for (const segment of scanSql(sql, "postgres")) {
    const token = sql.slice(segment.start, segment.end);
    if (segment.kind !== "identifier" || !token.startsWith('"') || !token.endsWith('"')) {
      result += token;
      continue;
    }
    const inner = token.slice(1, -1).replace(/""/g, '"');
    const keep =
      knownIdentifiers.has(inner) ||
      localIdentifiers.has(inner) ||
      !isValuePosition(code, segment.start, segment.end);
    result += keep ? token : `'${inner.replace(/'/g, "''")}'`;
  }
  return result;
}

/** Load every user schema, relation (including views and materialized views), and column name. */
export async function fetchKnownIdentifiers(pool: Pool): Promise<Set<string>> {
  const [schemas, relations, columns] = await Promise.all([
    pool.query<{ name: string }>(
      `SELECT nspname AS name FROM pg_catalog.pg_namespace WHERE nspname <> ALL($1::text[])`,
      [SYSTEM_SCHEMAS]
    ),
    pool.query<{ name: string }>(
      `SELECT c.relname AS name
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND n.nspname <> ALL($1::text[])`,
      [SYSTEM_SCHEMAS]
    ),
    pool.query<{ name: string }>(
      `SELECT DISTINCT a.attname AS name
         FROM pg_catalog.pg_attribute a
         JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND a.attnum > 0 AND NOT a.attisdropped
          AND n.nspname <> ALL($1::text[])`,
      [SYSTEM_SCHEMAS]
    )
  ]);
  const identifiers = new Set<string>();
  for (const row of [...schemas.rows, ...relations.rows, ...columns.rows]) {
    identifiers.add(row.name);
  }
  return identifiers;
}
