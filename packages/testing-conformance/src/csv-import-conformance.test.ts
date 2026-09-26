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

async function postCsv(
  adapter: DatabaseAdapter,
  schema: string,
  tableName: string,
  mode: "validate" | "import",
  mapping: Record<string, string | null>,
  csv: string
) {
  const app = createServer({ adapter });
  const upload = multipart(mode, mapping, csv);
  try {
    return await app.inject({
      method: "POST",
      url: `/api/tables/${encodeURIComponent(schema)}/${tableName}/import.csv`,
      headers: { authorization: `Bearer ${app.authToken}`, "content-type": upload.contentType },
      payload: upload.body
    });
  } finally {
    await app.close();
  }
}

const labelTable = `qyre_csv_labels_${suffix}`;

describe.each([
  {
    name: "postgres" as const,
    factory: postgresAdapterFactory,
    raw: process.env[TEST_DB_ENV]?.trim() || undefined,
    schema: () => "public",
    setup: [
      `DROP TABLE IF EXISTS ${labelTable}`,
      `DROP TYPE IF EXISTS ${labelTable}_mood`,
      `CREATE TYPE ${labelTable}_mood AS ENUM ('happy', 'sad')`,
      `CREATE TABLE ${labelTable} (id int PRIMARY KEY, mood ${labelTable}_mood NOT NULL)`
    ],
    teardown: [`DROP TABLE IF EXISTS ${labelTable}`, `DROP TYPE IF EXISTS ${labelTable}_mood`],
    mapping: { Id: "id", Mood: "mood" } as Record<string, string>,
    csv: "Id,Mood\n1,happy\n2,angry\n3,Happy\n4,sad\n",
    badLines: [3, 4]
  },
  {
    name: "mysql" as const,
    factory: mysqlAdapterFactory,
    raw: process.env[TEST_MYSQL_ENV]?.trim() || undefined,
    schema: (raw: string) => decodeURIComponent(new URL(raw).pathname.slice(1)),
    setup: [
      `DROP TABLE IF EXISTS ${labelTable}`,
      `CREATE TABLE ${labelTable} (id INT PRIMARY KEY, mood ENUM('happy', 'sad') NOT NULL, tags SET('a', 'b') NOT NULL)`
    ],
    teardown: [`DROP TABLE IF EXISTS ${labelTable}`],
    mapping: { Id: "id", Mood: "mood", Tags: "tags" } as Record<string, string>,
    csv: 'Id,Mood,Tags\n1,happy,"a,b"\n2,sad,\n3,angry,a\n4,happy,"a,c"\n',
    badLines: [4, 5]
  }
])(
  "csv import enum and set labels: $name",
  ({ name, factory, raw, schema, setup, teardown, mapping, csv, badLines }) => {
    let adapter: DatabaseAdapter;

    beforeAll(async () => {
      if (!raw) return;
      adapter = factory.create({ engine: name, raw });
      await adapter.connect();
      for (const sql of setup) await adapter.runQuery!(sql);
    });

    afterAll(async () => {
      if (!raw) return;
      for (const sql of teardown) await adapter.runQuery!(sql);
      await adapter.disconnect();
    });

    it.skipIf(!raw)("dry run reports values outside the column's labels", async () => {
      const response = await postCsv(adapter, schema(raw!), labelTable, "validate", mapping, csv);

      expect(response.statusCode).toBe(200);
      const body = response.json() as { validRows: number; errors: Array<{ line: number }> };
      expect(body.errors.map((error) => error.line)).toEqual(badLines);
      expect(body.validRows).toBe(2);
    });

    it.skipIf(!raw)("imports the rows whose values match the labels", async () => {
      const valid = csv
        .split("\n")
        .filter((_, index) => !badLines.includes(index + 1))
        .join("\n");
      const response = await postCsv(adapter, schema(raw!), labelTable, "import", mapping, valid);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ insertedRows: 2, failedRows: 0 });
    });
  }
);

const myisamTable = `qyre_csv_myisam_${suffix}`;

describe("csv import on a non-transactional MySQL table", () => {
  const raw = process.env[TEST_MYSQL_ENV]?.trim() || undefined;
  let adapter: DatabaseAdapter;

  beforeAll(async () => {
    if (!raw) return;
    adapter = mysqlAdapterFactory.create({ engine: "mysql", raw });
    await adapter.connect();
    await adapter.runQuery!(`DROP TABLE IF EXISTS ${myisamTable}`);
    await adapter.runQuery!(
      `CREATE TABLE ${myisamTable} (id INT PRIMARY KEY, n INT NOT NULL) ENGINE=MyISAM`
    );
  });

  afterAll(async () => {
    if (!raw) return;
    await adapter.runQuery!(`DROP TABLE IF EXISTS ${myisamTable}`);
    await adapter.disconnect();
  });

  it.skipIf(!raw)("reports the rows MySQL could not roll back", async () => {
    const schema = decodeURIComponent(new URL(raw!).pathname.slice(1));
    const response = await postCsv(
      adapter,
      schema,
      myisamTable,
      "import",
      { Id: "id", N: "n" },
      "Id,N\n1,1\n2,2\n1,3\n4,4\n"
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      insertedRows: 2,
      failedRows: 2,
      errors: [{ line: 4, message: expect.stringMatching(/could not be rolled back/i) }]
    });
    const stored = await adapter.runQuery!(`SELECT id FROM ${myisamTable} ORDER BY id`);
    expect(stored.rows.map((row) => Number(row.id))).toEqual([1, 2]);
  });
});
