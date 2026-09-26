import type { ColumnMetadata, CsvImportMapping } from "@qyre/core";
import { CSV_IMPORT_MAX_ERRORS } from "@qyre/core";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { processCsvImport } from "../../src/services/transfer/csv-import.js";
import { makeFakeAdapter } from "../support/fake-adapter.js";

const columns: ColumnMetadata[] = [
  { name: "name", dataType: "varchar", nullable: false, isPrimaryKey: false, isForeignKey: false },
  { name: "age", dataType: "int4", nullable: false, isPrimaryKey: false, isForeignKey: false },
  {
    name: "active",
    dataType: "boolean",
    nullable: false,
    isPrimaryKey: false,
    isForeignKey: false
  },
  {
    name: "joined",
    dataType: "timestamp",
    nullable: true,
    isPrimaryKey: false,
    isForeignKey: false
  }
];

const mapping: CsvImportMapping = {
  Name: "name",
  Age: "age",
  Active: "active",
  Joined: "joined"
};

function csvStream(csv: string): Readable {
  return Readable.from([csv]);
}

function adapter(overrides = {}) {
  return makeFakeAdapter({
    getTable: async () => ({
      schema: "public",
      name: "users",
      kind: "table",
      columns,
      permissions: { select: true, insert: true, update: false, delete: false }
    }),
    mutations: {
      insertRow: async (_schema, _table, values) => ({ row: values }),
      commitBatch: async (ops) => ({
        committed: true as const,
        results: ops.map(() => ({ row: {} }))
      })
    },
    ...overrides
  });
}

describe("processCsvImport", () => {
  it("inspects quoted multiline CSV while retaining the physical source line", async () => {
    const result = await processCsvImport(
      adapter(),
      "public",
      "users",
      "inspect",
      undefined,
      csvStream('Name,Note\nAda,"first\nsecond"\n')
    );

    expect(result).toEqual({
      mode: "inspect",
      headers: ["Name", "Note"],
      rowCount: 1,
      preview: [{ line: 3, values: { Name: "Ada", Note: "first\nsecond" } }]
    });
  });

  it("dry-runs the same typed coercion used by import and reports bad rows by line", async () => {
    const result = await processCsvImport(
      adapter(),
      "public",
      "users",
      "validate",
      mapping,
      csvStream("Name,Age,Active,Joined\nAda,42,true,2026-07-13T12:00:00Z\nBad,0x10,yes,\n")
    );

    expect(result).toMatchObject({
      mode: "validate",
      rowCount: 2,
      validRows: 1,
      insertedRows: 0,
      failedRows: 1,
      preview: [
        {
          line: 2,
          values: { name: "Ada", age: 42, active: true, joined: "2026-07-13T12:00:00Z" }
        }
      ],
      errors: [{ line: 3, column: "age" }]
    });
  });

  it("accepts ISO time-only values without requiring a date component", async () => {
    const result = await processCsvImport(
      adapter({
        getTable: async () => ({
          schema: "public",
          name: "alarms",
          kind: "table",
          columns: [
            {
              name: "at",
              dataType: "time",
              nullable: false,
              isPrimaryKey: false,
              isForeignKey: false
            }
          ],
          permissions: { select: true, insert: true, update: false, delete: false }
        })
      }),
      "public",
      "alarms",
      "validate",
      { Time: "at" },
      csvStream("Time\n12:30:45.123\n")
    );

    expect(result).toMatchObject({
      validRows: 1,
      preview: [{ line: 2, values: { at: "12:30:45.123" } }]
    });
  });

  it("commits every SQL row in one transaction and reports a rollback when any row fails", async () => {
    const batchSizes: number[] = [];
    const rows = Array.from({ length: 600 }, (_, index) => `User ${index},${index},1,`).join("\n");
    const result = await processCsvImport(
      adapter({
        mutations: {
          insertRow: async () => ({ row: {} }),
          commitBatch: async (ops) => {
            batchSizes.push(ops.length);
            return { committed: false as const, failedIndex: 520 };
          }
        }
      }),
      "public",
      "users",
      "import",
      mapping,
      csvStream(`Name,Age,Active,Joined\n${rows}\nBad,x,1,\n`)
    );

    expect(batchSizes).toEqual([600]);
    expect(result).toMatchObject({
      mode: "import",
      rowCount: 601,
      validRows: 600,
      insertedRows: 0,
      failedRows: 601
    });
    if (result.mode === "inspect") throw new Error("Expected an import result.");
    expect(result.errors[0]).toEqual({
      line: 522,
      message: expect.stringMatching(/rolled back and no rows were written/i)
    });
    expect(result.errors[1]).toMatchObject({ line: 602, column: "age" });
  });

  it("keeps the rollback error visible when row errors already fill the error list", async () => {
    const badRows = Array.from({ length: 150 }, (_, index) => `Bad${index},x,true,`).join("\n");
    const result = await processCsvImport(
      adapter({
        mutations: {
          insertRow: async () => ({ row: {} }),
          commitBatch: async () => ({ committed: false as const, failedIndex: 0 })
        }
      }),
      "public",
      "users",
      "import",
      mapping,
      csvStream(`Name,Age,Active,Joined\nAda,1,true,\n${badRows}\n`)
    );

    if (result.mode === "inspect") throw new Error("Expected an import result.");
    expect(result).toMatchObject({ insertedRows: 0, failedRows: 151 });
    expect(result.errors).toHaveLength(CSV_IMPORT_MAX_ERRORS);
    expect(result.errors[0]).toMatchObject({
      line: 2,
      message: expect.stringMatching(/rolled back/)
    });
  });

  it.each([
    [
      "a malformed record after the first batch",
      `Name,Age,Active,Joined\n${Array.from({ length: 300 }, (_, i) => `U${i},${i},1,`).join("\n")}\nshort,1\n`,
      400
    ],
    [
      "more rows than the fixed cap",
      `Name,Age,Active,Joined\n${Array.from({ length: 10_001 }, (_, i) => `U${i},${i},1,`).join("\n")}\n`,
      413
    ]
  ])("writes no rows when the upload contains %s", async (_label, csv, statusCode) => {
    let writes = 0;
    const write = async (ops: unknown[]) => {
      writes += ops.length;
      return { committed: true as const, results: ops.map(() => ({ row: {} })) };
    };
    await expect(
      processCsvImport(
        adapter({ mutations: { insertRow: async () => ({ row: {} }), commitBatch: write } }),
        "public",
        "users",
        "import",
        mapping,
        csvStream(csv)
      )
    ).rejects.toMatchObject({ statusCode });
    expect(writes).toBe(0);
  });

  it("rejects a size-truncated upload before writing its partial last record", async () => {
    let writes = 0;
    const input = Object.assign(csvStream("Name,Age,Active,Joined\nAda,42,true,\nGrace,4"), {
      truncated: true
    });
    await expect(
      processCsvImport(
        adapter({
          mutations: {
            insertRow: async () => ({ row: {} }),
            commitBatch: async (ops) => {
              writes += ops.length;
              return { committed: true as const, results: ops.map(() => ({ row: {} })) };
            }
          }
        }),
        "public",
        "users",
        "import",
        mapping,
        input
      )
    ).rejects.toMatchObject({ statusCode: 413 });
    expect(writes).toBe(0);
  });

  it("sends SQL engines numbers only when exact and the literal text otherwise", async () => {
    const numericTable = (engine: "postgres" | "mongodb") => ({
      engine,
      getTable: async () => ({
        schema: "public",
        name: "numbers",
        kind: engine === "mongodb" ? ("collection" as const) : ("table" as const),
        columns: [
          {
            name: "big",
            dataType: engine === "mongodb" ? "number" : "int8",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          }
        ],
        permissions: { select: true, insert: true, update: true, delete: true }
      })
    });
    const csv = "Big\n9007199254740993\n 1.23456789012345678901 \n42\n1.0\n1e3\n-0.50\n";

    const sql = await processCsvImport(
      adapter(numericTable("postgres")),
      "public",
      "numbers",
      "validate",
      { Big: "big" },
      csvStream(csv)
    );
    expect(sql.preview.map((row) => row.values)).toEqual([
      { big: "9007199254740993" },
      { big: "1.23456789012345678901" },
      { big: 42 },
      { big: 1 },
      { big: 1000 },
      { big: -0.5 }
    ]);

    const mongo = await processCsvImport(
      adapter(numericTable("mongodb")),
      "public",
      "numbers",
      "validate",
      { Big: "big" },
      csvStream(csv)
    );
    expect(mongo.preview.map((row) => row.values)).toEqual([
      { big: { $numberLong: "9007199254740993" } },
      { big: Number("1.23456789012345678901") },
      { big: 42 },
      { big: 1 },
      { big: 1000 },
      { big: -0.5 }
    ]);
  });

  it("propagates an unexpected SQL batch failure instead of reporting a row validation error", async () => {
    const failure = new Error("connection lost");

    await expect(
      processCsvImport(
        adapter({
          mutations: {
            insertRow: async () => ({ row: {} }),
            commitBatch: async () => {
              throw failure;
            }
          }
        }),
        "public",
        "users",
        "import",
        mapping,
        csvStream("Name,Age,Active,Joined\nAda,42,true,\n")
      )
    ).rejects.toBe(failure);
  });

  it("uses one-document atomic batches for MongoDB and continues after a rejected row", async () => {
    let calls = 0;
    const received: Array<Record<string, unknown>> = [];
    const result = await processCsvImport(
      adapter({
        engine: "mongodb",
        getTable: async () => ({
          schema: "app",
          name: "users",
          kind: "collection",
          columns: [
            { ...columns[0]!, dataType: "string" },
            { ...columns[1]!, dataType: "number" },
            { ...columns[2]!, dataType: "boolean" },
            { ...columns[3]!, dataType: "date" }
          ],
          permissions: { select: true, insert: true, update: true, delete: true }
        }),
        mutations: {
          insertRow: async (_schema, _table, values) => {
            calls += 1;
            if (calls === 2) throw new Error("duplicate key");
            received.push(values);
            return { row: values };
          }
        }
      }),
      "app",
      "users",
      "import",
      mapping,
      csvStream(
        "Name,Age,Active,Joined\nAda,1,true,2026-07-13T12:00:00Z\nGrace,2,false,\nLinus,3,1,\n"
      )
    );

    expect(calls).toBe(3);
    expect(received[0]?.joined).toEqual({ $date: "2026-07-13T12:00:00Z" });
    expect(result).toMatchObject({ insertedRows: 2, failedRows: 1 });
    if (result.mode === "inspect") throw new Error("Expected an import result.");
    expect(result.errors).toEqual([
      { line: 3, message: "The database rejected this row; other rows were still inserted." }
    ]);
  });

  it("rejects views and missing insert permission before parsing", async () => {
    await expect(
      processCsvImport(
        adapter({
          getTable: async () => ({
            schema: "public",
            name: "users",
            kind: "view",
            columns,
            permissions: { select: true, insert: true, update: false, delete: false }
          })
        }),
        "public",
        "users",
        "inspect",
        undefined,
        csvStream("Name\nAda\n")
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      processCsvImport(
        adapter({
          getTable: async () => ({
            schema: "public",
            name: "users",
            kind: "table",
            columns,
            permissions: { select: true, insert: false, update: false, delete: false }
          })
        }),
        "public",
        "users",
        "inspect",
        undefined,
        csvStream("Name\nAda\n")
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects an upload that exceeds the fixed row cap", async () => {
    const rows = Array.from({ length: 10_001 }, (_, index) => `User ${index}`).join("\n");
    await expect(
      processCsvImport(
        adapter(),
        "public",
        "users",
        "inspect",
        undefined,
        csvStream(`Name\n${rows}\n`)
      )
    ).rejects.toMatchObject({ statusCode: 413 });
  });

  it("caps the returned per-row errors while failedRows still reports the true total (F136)", async () => {
    const badRows = Array.from(
      { length: 150 },
      (_, index) => `Bad${index},not-a-number,true,`
    ).join("\n");
    const result = await processCsvImport(
      adapter(),
      "public",
      "users",
      "validate",
      mapping,
      csvStream(`Name,Age,Active,Joined\n${badRows}\n`)
    );

    expect(result).toMatchObject({
      mode: "validate",
      rowCount: 150,
      validRows: 0,
      failedRows: 150
    });
    expect((result as { errors: unknown[] }).errors).toHaveLength(CSV_IMPORT_MAX_ERRORS);
  });
});
