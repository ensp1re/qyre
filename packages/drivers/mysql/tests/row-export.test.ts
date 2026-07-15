import mysql from "mysql2/promise";
import { afterAll, describe, expect, it } from "vitest";
import { formatSqlInsert } from "../src/query/row-export.js";

const pool = mysql.createPool("mysql://unused:unused@localhost/unused");

afterAll(async () => {
  await pool.end();
});

describe("MySQL row export", () => {
  it("uses mysql2 escaping for identifiers, strings, and binary values", () => {
    expect(
      formatSqlInsert(pool, "odd`schema", "users", ["name", "payload"], {
        name: "O'Reilly\\path",
        payload: Buffer.from([0, 255])
      })
    ).toBe(
      "INSERT INTO `odd``schema`.`users` (`name`, `payload`) VALUES ('O\\'Reilly\\\\path', X'00ff');"
    );
  });
});
