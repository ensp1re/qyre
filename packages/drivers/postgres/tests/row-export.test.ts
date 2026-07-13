import { describe, expect, it } from "vitest";
import { formatSqlInsert } from "../src/row-export.js";

describe("Postgres row export", () => {
  it("quotes identifiers and literals in an executable INSERT statement", () => {
    expect(
      formatSqlInsert('odd"schema', "we'ird", ['na"me', "payload"], {
        'na"me': "O'Reilly",
        payload: Buffer.from([0, 255])
      })
    ).toBe(
      `INSERT INTO "odd""schema"."we'ird" ("na""me", "payload") VALUES ('O''Reilly', decode('00ff', 'hex'));`
    );
  });
});
