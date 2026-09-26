export const SQL_DIALECTS = ["postgres", "mysql", "sqlite"] as const;
export type SqlDialect = (typeof SQL_DIALECTS)[number];

export type SqlSegmentKind = "code" | "comment" | "string" | "identifier";

export interface SqlSegment {
  readonly kind: SqlSegmentKind;
  readonly start: number;
  readonly end: number;
}

export function isSqlDialect(value: string): value is SqlDialect {
  return (SQL_DIALECTS as readonly string[]).includes(value);
}

const IDENT_START = /[A-Za-z_\u0080-￿]/;
const IDENT_CONT = /[A-Za-z0-9_$\u0080-￿]/;
const DOLLAR_TAG = /\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/y;
const MYSQL_EXECUTABLE_COMMENT = /\/\*!\d*/y;

function lineCommentEnd(sql: string, start: number): number {
  const newline = sql.indexOf("\n", start);
  return newline === -1 ? sql.length : newline;
}

function blockCommentEnd(sql: string, start: number, nested: boolean): number {
  let depth = 1;
  let index = start + 2;
  while (index < sql.length) {
    if (nested && sql[index] === "/" && sql[index + 1] === "*") {
      depth += 1;
      index += 2;
    } else if (sql[index] === "*" && sql[index + 1] === "/") {
      depth -= 1;
      index += 2;
      if (depth === 0) return index;
    } else {
      index += 1;
    }
  }
  return sql.length;
}

function quotedEnd(sql: string, start: number, close: string, backslashEscapes: boolean): number {
  let index = start + 1;
  while (index < sql.length) {
    const char = sql[index];
    if (backslashEscapes && char === "\\") {
      index += 2;
    } else if (char === close) {
      if (close !== "]" && sql[index + 1] === close) {
        index += 2;
      } else {
        return index + 1;
      }
    } else {
      index += 1;
    }
  }
  return sql.length;
}

function isMysqlDashComment(sql: string, index: number): boolean {
  const after = sql.charCodeAt(index + 2);
  return Number.isNaN(after) || after <= 32;
}

/**
 * Split SQL into code, comment, and quoted segments in one left-to-right pass, following the
 * dialect's lexical rules so a marker inside one construct never starts another.
 */
export function scanSql(sql: string, dialect: SqlDialect): SqlSegment[] {
  const segments: SqlSegment[] = [];
  let codeStart = 0;
  let index = 0;
  let inMysqlExecutableComment = false;

  const emit = (kind: SqlSegmentKind, start: number, end: number): void => {
    if (start > codeStart) segments.push({ kind: "code", start: codeStart, end: start });
    segments.push({ kind, start, end });
    codeStart = end;
    index = end;
  };

  while (index < sql.length) {
    const char = sql[index] as string;
    const next = sql[index + 1];

    if (char === "-" && next === "-" && (dialect !== "mysql" || isMysqlDashComment(sql, index))) {
      emit("comment", index, lineCommentEnd(sql, index));
    } else if (char === "#" && dialect === "mysql") {
      emit("comment", index, lineCommentEnd(sql, index));
    } else if (char === "/" && next === "*") {
      MYSQL_EXECUTABLE_COMMENT.lastIndex = index;
      const executable = dialect === "mysql" ? MYSQL_EXECUTABLE_COMMENT.exec(sql) : null;
      if (executable) {
        // MySQL runs the body of /*! ... */ as SQL, so only the markers are comments.
        inMysqlExecutableComment = true;
        emit("comment", index, index + executable[0].length);
      } else {
        emit("comment", index, blockCommentEnd(sql, index, dialect === "postgres"));
      }
    } else if (char === "*" && next === "/" && inMysqlExecutableComment) {
      inMysqlExecutableComment = false;
      emit("comment", index, index + 2);
    } else if (char === "'") {
      emit("string", index, quotedEnd(sql, index, "'", dialect === "mysql"));
    } else if (char === '"') {
      emit(
        dialect === "mysql" ? "string" : "identifier",
        index,
        quotedEnd(sql, index, '"', dialect === "mysql")
      );
    } else if (char === "`" && dialect !== "postgres") {
      emit("identifier", index, quotedEnd(sql, index, "`", false));
    } else if (char === "[" && dialect === "sqlite") {
      emit("identifier", index, quotedEnd(sql, index, "]", false));
    } else if (char === "$" && dialect === "postgres") {
      DOLLAR_TAG.lastIndex = index;
      const tag = DOLLAR_TAG.exec(sql)?.[0];
      if (tag) {
        const close = sql.indexOf(tag, index + tag.length);
        emit("string", index, close === -1 ? sql.length : close + tag.length);
      } else {
        index += 1;
      }
    } else if (IDENT_START.test(char)) {
      if (dialect === "postgres" && (char === "E" || char === "e") && next === "'") {
        emit("string", index, quotedEnd(sql, index + 1, "'", true));
        continue;
      }
      // Consume the whole word: `$` and quote characters inside it do not start a new token.
      index += 1;
      while (index < sql.length && IDENT_CONT.test(sql[index] as string)) index += 1;
    } else {
      index += 1;
    }
  }
  if (codeStart < sql.length) segments.push({ kind: "code", start: codeStart, end: sql.length });
  return segments;
}

/** Replace the chosen segment kinds with spaces, preserving every offset. */
export function maskSql(
  sql: string,
  dialect: SqlDialect,
  kinds: ReadonlyArray<Exclude<SqlSegmentKind, "code">>
): string {
  let result = "";
  for (const segment of scanSql(sql, dialect)) {
    const text = sql.slice(segment.start, segment.end);
    result +=
      segment.kind !== "code" && kinds.includes(segment.kind) ? " ".repeat(text.length) : text;
  }
  return result;
}
