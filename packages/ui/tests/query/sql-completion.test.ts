import { describe, expect, it } from "vitest";
import type { CompletionTable } from "../../src/query/sql-completion.js";
import {
  isTableNamePosition,
  matchColumns,
  matchKeywords,
  matchQualifiedPrefix,
  matchTableNames,
  needsQuoting,
  quoteIdentifier,
  resolveReferencedTables
} from "../../src/query/sql-completion.js";

describe("isTableNamePosition", () => {
  it("is true right after FROM/JOIN, case-insensitively", () => {
    expect(isTableNamePosition("SELECT * FROM ")).toBe(true);
    expect(isTableNamePosition("select * from ")).toBe(true);
    expect(isTableNamePosition("SELECT * FROM qy")).toBe(true);
    expect(isTableNamePosition("SELECT * JOIN ")).toBe(true);
  });

  it("is false everywhere else", () => {
    expect(isTableNamePosition("SE")).toBe(false);
    expect(isTableNamePosition("SELECT * WHE")).toBe(false);
    expect(isTableNamePosition("SELECT * FROM users WHERE ")).toBe(false);
  });
});

describe("matchKeywords", () => {
  it("returns all keywords for an empty prefix", () => {
    expect(matchKeywords("")).toContain("SELECT");
    expect(matchKeywords("")).toContain("WHERE");
  });

  it("filters case-insensitively by prefix", () => {
    expect(matchKeywords("SE")).toEqual(["SELECT"]);
    expect(matchKeywords("whe")).toEqual(["WHERE"]);
  });

  it("never offers write-shaped keywords", () => {
    expect(matchKeywords("INSERT")).toEqual([]);
    expect(matchKeywords("DELETE")).toEqual([]);
    expect(matchKeywords("UPDATE")).toEqual([]);
  });
});

describe("matchTableNames", () => {
  const tables = ["qyre_demo_users", "orders", "order_items"];

  it("returns all tables for an empty prefix", () => {
    expect(matchTableNames("", tables)).toEqual(tables);
  });

  it("filters case-insensitively by prefix", () => {
    expect(matchTableNames("qy", tables)).toEqual(["qyre_demo_users"]);
    expect(matchTableNames("order", tables)).toEqual(["orders", "order_items"]);
  });

  it("returns nothing when no table matches", () => {
    expect(matchTableNames("zzz", tables)).toEqual([]);
  });
});

describe("matchColumns", () => {
  const columns = ["id", "email", "created_at"];

  it("returns all columns for an empty prefix", () => {
    expect(matchColumns("", columns)).toEqual(columns);
  });

  it("filters case-insensitively by prefix", () => {
    expect(matchColumns("cr", columns)).toEqual(["created_at"]);
    expect(matchColumns("EM", columns)).toEqual(["email"]);
  });

  it("returns nothing when no column matches", () => {
    expect(matchColumns("zzz", columns)).toEqual([]);
  });
});

describe("resolveReferencedTables (F127 alias resolution)", () => {
  const users: CompletionTable = { name: "users", columns: ["id", "name"] };
  const orders: CompletionTable = { name: "orders", columns: ["id", "user_id", "total"] };
  const tables = [users, orders];

  it("maps an unaliased table's own name to itself, case-insensitively", () => {
    const resolved = resolveReferencedTables("SELECT * FROM Users", tables);
    expect(resolved.get("users")).toBe(users);
  });

  it("maps an alias (with or without AS) to the referenced table", () => {
    const withAs = resolveReferencedTables("SELECT * FROM users AS u", tables);
    expect(withAs.get("u")).toBe(users);
    expect(withAs.get("users")).toBe(users);

    const withoutAs = resolveReferencedTables("SELECT * FROM users u", tables);
    expect(withoutAs.get("u")).toBe(users);
  });

  it("resolves every JOIN clause's table and alias too", () => {
    const resolved = resolveReferencedTables(
      "SELECT * FROM users u JOIN orders o ON u.id = o.user_id",
      tables
    );
    expect(resolved.get("u")).toBe(users);
    expect(resolved.get("o")).toBe(orders);
  });

  it("strips quoting from a quoted table name or alias", () => {
    const resolved = resolveReferencedTables('SELECT * FROM "users" AS "u"', tables);
    expect(resolved.get("u")).toBe(users);
  });

  it("resolves a schema-qualified reference by its bare table name", () => {
    const resolved = resolveReferencedTables("SELECT * FROM public.users", tables);
    expect(resolved.get("users")).toBe(users);
  });

  it("silently skips a reference that matches no known table", () => {
    const resolved = resolveReferencedTables("SELECT * FROM nonexistent n", tables);
    expect(resolved.has("n")).toBe(false);
    expect(resolved.has("nonexistent")).toBe(false);
  });

  it("does not mistake a following clause keyword for an alias", () => {
    const resolved = resolveReferencedTables("SELECT * FROM users WHERE id = 1", tables);
    expect(resolved.get("users")).toBe(users);
    expect(resolved.has("where")).toBe(false);
  });

  it("resolves both sides of a JOIN with no alias between the first table and JOIN", () => {
    const resolved = resolveReferencedTables(
      "SELECT * FROM users JOIN orders ON users.id = orders.user_id",
      tables
    );
    expect(resolved.get("users")).toBe(users);
    expect(resolved.get("orders")).toBe(orders);
  });
});

describe("matchQualifiedPrefix", () => {
  it("returns the bare identifier right before a trailing dot", () => {
    expect(matchQualifiedPrefix("SELECT u.")).toBe("u");
    expect(matchQualifiedPrefix("SELECT * FROM users u WHERE u.")).toBe("u");
  });

  it("unquotes a quoted identifier before the dot", () => {
    expect(matchQualifiedPrefix('SELECT "Users".')).toBe("Users");
    expect(matchQualifiedPrefix("SELECT `Users`.")).toBe("Users");
  });

  it("returns null when the cursor isn't right after a dot", () => {
    expect(matchQualifiedPrefix("SELECT u")).toBeNull();
    expect(matchQualifiedPrefix("SELECT u.i")).toBeNull();
  });
});

describe("needsQuoting", () => {
  it("does not quote a simple lowercase identifier", () => {
    expect(needsQuoting("email")).toBe(false);
    expect(needsQuoting("created_at")).toBe(false);
    expect(needsQuoting("_id")).toBe(false);
  });

  it("quotes a mixed-case identifier", () => {
    expect(needsQuoting("Email")).toBe(true);
    expect(needsQuoting("createdAt")).toBe(true);
  });

  it("quotes an identifier with spaces or punctuation", () => {
    expect(needsQuoting("user name")).toBe(true);
    expect(needsQuoting("user-name")).toBe(true);
  });

  it("quotes an identifier starting with a digit", () => {
    expect(needsQuoting("1email")).toBe(true);
  });
});

describe("quoteIdentifier (F127 per-engine quoting)", () => {
  it("leaves a simple lowercase identifier unquoted on every engine", () => {
    expect(quoteIdentifier("email", "postgres")).toBe("email");
    expect(quoteIdentifier("email", "mysql")).toBe("email");
    expect(quoteIdentifier("email", "sqlite")).toBe("email");
  });

  it("quotes a mixed-case identifier with double quotes on Postgres/SQLite", () => {
    expect(quoteIdentifier("Email", "postgres")).toBe('"Email"');
    expect(quoteIdentifier("Email", "sqlite")).toBe('"Email"');
  });

  it("quotes a mixed-case identifier with backticks on MySQL", () => {
    expect(quoteIdentifier("Email", "mysql")).toBe("`Email`");
  });

  it("doubles an embedded quote of the dialect's own kind", () => {
    expect(quoteIdentifier('a"b', "postgres")).toBe('"a""b"');
    expect(quoteIdentifier("a`b", "mysql")).toBe("`a``b`");
  });
});
