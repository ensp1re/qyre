import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseEngine } from "@qyre/core";
import type { AdapterFactory, DatabaseAdapter } from "@qyre/driver-contract";
import { mysqlAdapterFactory } from "@qyre/mysql";
import { postgresAdapterFactory } from "@qyre/postgres";
import { createServer } from "@qyre/server";
import { sqliteAdapterFactory } from "@qyre/sqlite";
import Database from "better-sqlite3";
import { TEST_DB_ENV, TEST_MYSQL_ENV } from "@qyre/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { suffix } from "./fixtures/engine-cases.js";

// MongoDB is not covered here: standalone MongoDB cannot roll back earlier documents, so its
// import returns an explicit partial result (unit-tested in @qyre/server).
interface SqlImportCase {
  name: DatabaseEngine;
  factory: AdapterFactory;
  raw: () => string | undefined;
  schema: (raw: string) => string;
  createTable: string;
  bigAsText: string;
  amountAsText: string;
}

const table = `qyre_csv_import_${suffix}`;
let sqliteDir: string | undefined;

const cases: SqlImportCase[] = [
  {
    name: "postgres",
    factory: postgresAdapterFactory,
    raw: () => process.env[TEST_DB_ENV]?.trim() || undefined,
    schema: () => "public",
    createTable: `CREATE TABLE ${table} (id int PRIMARY KEY, big bigint NOT NULL, amount numeric(30,20) NOT NULL)`,
    bigAsText: "big::text",
    amountAsText: "amount::text"
  },
  {
    name: "mysql",
    factory: mysqlAdapterFactory,
    raw: () => process.env[TEST_MYSQL_ENV]?.trim() || undefined,
    schema: (raw) => decodeURIComponent(new URL(raw).pathname.slice(1)),
    createTable: `CREATE TABLE ${table} (id INT PRIMARY KEY, big BIGINT NOT NULL, amount DECIMAL(30,20) NOT NULL)`,
    bigAsText: "CAST(big AS CHAR)",
    amountAsText: "CAST(amount AS CHAR)"
  },
  {
    name: "sqlite",
    factory: sqliteAdapterFactory,
    raw: () => {
      sqliteDir ??= mkdtempSync(join(tmpdir(), "qyre-csv-import-"));
      const path = join(sqliteDir, "import.db");
      new Database(path).close();
      return path;
    },
    schema: () => "main",
    // SQLite has no fixed-precision decimal storage; only its 64-bit integer path is exact.
    createTable: `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, big INTEGER NOT NULL, amount TEXT NOT NULL)`,
    bigAsText: "CAST(big AS TEXT)",
    amountAsText: "amount"
  }
];

function multipart(mode: string, mapping: Record<string, string | null>, csv: string) {
  const boundary = "qyre-csv-import-conformance";
  const body = [
    `--${boundary}\r\nContent-Disposition: form-data; name="mode"\r\n\r\n${mode}\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="mapping"\r\n\r\n${JSON.stringify(mapping)}\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="rows.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`
  ].join("");
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

function rows(count: number, duplicateAt?: number): string {
  return Array.from({ length: count }, (_, index) => {
    const id = duplicateAt !== undefined && index + 1 === duplicateAt ? 1 : index + 1;
    return `${id},${index},0.5`;
  }).join("\n");
}

afterAll(() => {
  if (sqliteDir) rmSync(sqliteDir, { recursive: true, force: true });
});

describe.each(cases)(
  "csv import conformance: $name",
  (engineCase) => {
    const raw = engineCase.raw();
    let adapter: DatabaseAdapter;
    let schema: string;

    beforeAll(async () => {
      if (!raw) return;
      adapter = engineCase.factory.create({ engine: engineCase.name, raw });
      await adapter.connect();
      schema = engineCase.schema(raw);
      await adapter.runQuery!(`DROP TABLE IF EXISTS ${table}`);
      await adapter.runQuery!(engineCase.createTable);
    });

    beforeEach(async () => {
      if (raw) await adapter.runQuery!(`DELETE FROM ${table}`);
    });

    afterAll(async () => {
      if (!raw) return;
      await adapter.runQuery!(`DROP TABLE IF EXISTS ${table}`);
      await adapter.disconnect();
    });

    async function importCsv(csv: string) {
      const app = createServer({ adapter });
      const upload = multipart("import", { Id: "id", Big: "big", Amount: "amount" }, csv);
      try {
        return await app.inject({
          method: "POST",
          url: `/api/tables/${encodeURIComponent(schema)}/${table}/import.csv`,
          headers: { authorization: `Bearer ${app.authToken}`, "content-type": upload.contentType },
          payload: upload.body
        });
      } finally {
        await app.close();
      }
    }

    async function storedRows(): Promise<Array<Record<string, unknown>>> {
      const result = await adapter.runQuery!(
        `SELECT id, ${engineCase.bigAsText} AS big, ${engineCase.amountAsText} AS amount FROM ${table} ORDER BY id`
      );
      return result.rows;
    }

    it.skipIf(!raw)("rolls back every row when a constraint fails after 500 rows", async () => {
      const response = await importCsv(`Id,Big,Amount\n${rows(600, 520)}\n`);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        rowCount: 600,
        validRows: 600,
        insertedRows: 0,
        failedRows: 600,
        errors: [{ line: 521, message: expect.stringMatching(/rolled back/i) }]
      });
      expect(await storedRows()).toEqual([]);
    });

    it.skipIf(!raw)("writes no rows when a malformed record follows valid rows", async () => {
      const response = await importCsv(`Id,Big,Amount\n${rows(300)}\n301,1\n`);

      expect(response.statusCode).toBe(400);
      expect(await storedRows()).toEqual([]);
    });

    it.skipIf(!raw)("writes no rows when the file exceeds the row cap", async () => {
      const response = await importCsv(`Id,Big,Amount\n${rows(10_001)}\n`);

      expect(response.statusCode).toBe(413);
      expect(await storedRows()).toEqual([]);
    });

    it.skipIf(!raw)("stores bigint and high-precision numeric values exactly", async () => {
      const amount = "1234567890.12345678901234567890";
      const response = await importCsv(
        `Id,Big,Amount\n1,9007199254740993,${amount}\n2.0,1e3,0.5\n`
      );

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ insertedRows: 2, failedRows: 0 });
      const [exact, integral] = await storedRows();
      expect(String(exact?.big)).toBe("9007199254740993");
      expect(String(exact?.amount)).toBe(amount);
      expect(Number(integral?.id)).toBe(2);
      expect(String(integral?.big)).toBe("1000");
    });
  },
  // Thousands of row inserts on shared CI databases can exceed Vitest's 5s default.
  30_000
);
