import type { ColumnMetadata } from "@qyre/core";
import { describe, expect, it } from "vitest";
import { formatSqlInsert } from "../src/query/row-export.js";

function column(name: string, dataType: string, elementDataType?: string): ColumnMetadata {
  return {
    name,
    dataType,
    ...(elementDataType ? { elementDataType } : {}),
    nullable: true,
    isPrimaryKey: false,
    isForeignKey: false
  };
}

describe("Postgres row export", () => {
  it("quotes identifiers and literals in an executable INSERT statement", () => {
    expect(
      formatSqlInsert(
        'odd"schema',
        "we'ird",
        [column('na"me', "text"), column("payload", "bytea")],
        {
          'na"me': "O'Reilly",
          payload: Buffer.from([0, 255])
        }
      )
    ).toBe(
      `INSERT INTO "odd""schema"."we'ird" ("na""me", "payload") VALUES ('O''Reilly', decode('00ff', 'hex'));`
    );
  });

  it("writes native arrays in array input syntax and JSON arrays as JSON", () => {
    expect(
      formatSqlInsert(
        "public",
        "t",
        [
          column("ints", "ARRAY", "integer"),
          column("texts", "ARRAY", "text"),
          column("grid", "ARRAY", "integer"),
          column("docs", "ARRAY", "jsonb"),
          column("doc", "jsonb")
        ],
        {
          ints: [1, null, 3],
          texts: ['a"b', "c\\d", "it's", "NULL"],
          grid: [
            [1, 2],
            [3, 4]
          ],
          docs: [[1, 2], { k: "v" }],
          doc: [1, 2]
        }
      )
    ).toBe(
      `INSERT INTO "public"."t" ("ints", "texts", "grid", "docs", "doc") VALUES (` +
        `'{"1",NULL,"3"}', '{"a\\"b","c\\\\d","it''s","NULL"}', '{{"1","2"},{"3","4"}}', ` +
        `'{"[1,2]","{\\"k\\":\\"v\\"}"}', '[1,2]');`
    );
  });
});
