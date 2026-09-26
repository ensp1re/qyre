import type { ColumnDefinition } from "@qyre/core";
import type mysql from "mysql2/promise";
import { quoteIdent } from "../query/sql.js";

type ColumnChanges = Partial<Pick<ColumnDefinition, "dataType" | "nullable" | "default">>;

interface InformationSchemaColumn {
  COLUMN_TYPE: string;
  DATA_TYPE: string;
  IS_NULLABLE: "YES" | "NO";
  COLUMN_DEFAULT: string | null;
  EXTRA: string;
  COLUMN_COMMENT: string;
  CHARACTER_SET_NAME: string | null;
  COLLATION_NAME: string | null;
  GENERATION_EXPRESSION: string | null;
  SRS_ID?: number | null;
  TABLE_COLLATION: string | null;
}

const CHARACTER_TYPE = /^\s*(?:(?:var)?char|(?:tiny|medium|long)?text|enum|set)\b/i;
const TIMESTAMP_FUNCTION = /^(?:CURRENT_TIMESTAMP|NOW|LOCALTIME|LOCALTIMESTAMP)(?:\(\d*\))?/i;

/** Index just past the quoted literal or identifier opening at `start`. */
function skipQuoted(text: string, start: number): number {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === "\\" && quote !== "`") {
      index += 2;
      continue;
    }
    if (text[index] === quote) {
      if (text[index + 1] === quote) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  return text.length;
}

function skipParenthesized(text: string, open: number): number {
  let depth = 0;
  let index = open;
  while (index < text.length) {
    const char = text[index];
    if (char === "'" || char === '"' || char === "`") {
      index = skipQuoted(text, index);
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  throw new Error("Unbalanced parentheses in the column definition.");
}

/** Find `marker` outside quoted text in one `SHOW CREATE TABLE` column line. */
function findOutsideQuotes(line: string, marker: string): number {
  let index = 0;
  while (index < line.length) {
    const char = line[index];
    if (char === "'" || char === '"' || char === "`") {
      index = skipQuoted(line, index);
      continue;
    }
    if (line.startsWith(marker, index)) return index + marker.length;
    index += 1;
  }
  return -1;
}

/** information_schema escapes quotes inside stored expressions, so exact expression text is read
 * from the column's `SHOW CREATE TABLE` line instead. */
async function fetchCreateTableLine(
  pool: mysql.Pool,
  schema: string,
  table: string,
  column: string
): Promise<string> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SHOW CREATE TABLE ${quoteIdent(schema)}.${quoteIdent(table)}`
  );
  const createSql = String(rows[0]?.["Create Table"] ?? "");
  const prefix = `${quoteIdent(column)} `;
  const line = createSql
    .split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.startsWith(prefix));
  if (!line) throw new Error(`Could not read the definition of column "${column}".`);
  return line;
}

function expressionAfter(line: string, marker: string, column: string): string {
  const start = findOutsideQuotes(line, marker);
  if (start === -1) throw new Error(`Could not read the definition of column "${column}".`);
  if (line[start] === "(") return line.slice(start, skipParenthesized(line, start));
  const match = TIMESTAMP_FUNCTION.exec(line.slice(start));
  if (!match) throw new Error(`Could not read the definition of column "${column}".`);
  return match[0];
}

function literalDefaultSql(pool: mysql.Pool, row: InformationSchemaColumn, value: string): string {
  const dataType = row.DATA_TYPE.toLowerCase();
  if (dataType === "bit" && /^b'[01]*'$/i.test(value)) return value;
  if ((dataType === "binary" || dataType === "varbinary") && /^0x[0-9a-f]*$/i.test(value)) {
    return value;
  }
  // Servers that predate the DEFAULT_GENERATED flag report timestamp functions as plain defaults.
  if (/^(?:timestamp|datetime)$/.test(dataType) && TIMESTAMP_FUNCTION.exec(value)?.[0] === value) {
    return value;
  }
  return pool.escape(value);
}

/** Build the complete `MODIFY COLUMN` definition: the current column with `changes` applied and
 * every attribute MODIFY would otherwise reset carried over. */
export async function buildModifiedColumnSql(
  pool: mysql.Pool,
  schema: string,
  table: string,
  column: string,
  changes: ColumnChanges
): Promise<string> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT c.*, t.TABLE_COLLATION
       FROM information_schema.COLUMNS c
       JOIN information_schema.TABLES t
         ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
      WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ? AND c.COLUMN_NAME = ?`,
    [schema, table, column]
  );
  const row = rows[0] as InformationSchemaColumn | undefined;
  if (!row) throw new Error(`Column "${column}" not found.`);

  const extra = row.EXTRA.toLowerCase();
  const generated = /\b(virtual|stored) generated\b/.exec(extra)?.[1];
  const hasExpressionDefault = extra.includes("default_generated");
  const line =
    generated || (hasExpressionDefault && !("default" in changes))
      ? await fetchCreateTableLine(pool, schema, table, column)
      : "";

  const columnType = changes.dataType ?? row.COLUMN_TYPE;
  const parts = [quoteIdent(column), columnType];
  // A column collation equal to the table default is inherited, so restating it is unnecessary.
  if (CHARACTER_TYPE.test(columnType) && row.COLLATION_NAME !== row.TABLE_COLLATION) {
    if (row.CHARACTER_SET_NAME) parts.push(`CHARACTER SET ${row.CHARACTER_SET_NAME}`);
    if (row.COLLATION_NAME) parts.push(`COLLATE ${row.COLLATION_NAME}`);
  }
  if (row.SRS_ID !== undefined && row.SRS_ID !== null) parts.push(`SRID ${row.SRS_ID}`);
  if (generated) {
    parts.push(
      `GENERATED ALWAYS AS ${expressionAfter(line, " GENERATED ALWAYS AS ", column)} ${generated.toUpperCase()}`
    );
  }
  parts.push((changes.nullable ?? row.IS_NULLABLE === "YES") ? "NULL" : "NOT NULL");

  if ("default" in changes) {
    if (changes.default !== null && changes.default !== undefined) {
      parts.push(`DEFAULT ${pool.escape(changes.default)}`);
    }
  } else if (hasExpressionDefault) {
    parts.push(`DEFAULT ${expressionAfter(line, " DEFAULT ", column)}`);
  } else if (row.COLUMN_DEFAULT !== null && !generated) {
    parts.push(`DEFAULT ${literalDefaultSql(pool, row, row.COLUMN_DEFAULT)}`);
  }

  const onUpdate =
    /\bon update ((?:current_timestamp|now|localtime|localtimestamp)(?:\(\d*\))?)/i.exec(
      row.EXTRA
    )?.[1];
  if (onUpdate) parts.push(`ON UPDATE ${onUpdate}`);
  if (extra.includes("auto_increment")) parts.push("AUTO_INCREMENT");
  if (/\binvisible\b/.test(extra)) parts.push("INVISIBLE");
  if (row.COLUMN_COMMENT) parts.push(`COMMENT ${pool.escape(row.COLUMN_COMMENT)}`);
  return parts.join(" ");
}
