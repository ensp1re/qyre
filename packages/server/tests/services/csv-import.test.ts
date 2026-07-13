import type { ColumnMetadata, CsvImportMapping } from "@qyre/core";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { processCsvImport } from "../../src/services/csv-import.js";
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

  it("commits SQL rows in bounded batches and reports every line rolled back with a failed batch", async () => {
    const batchSizes: number[] = [];
    const rows = Array.from({ length: 251 }, (_, index) => `User ${index},${index},1,`).join("\n");
    const result = await processCsvImport(
      adapter({
        mutations: {
          insertRow: async () => ({ row: {} }),
          commitBatch: async (ops) => {
            batchSizes.push(ops.length);
            return batchSizes.length === 1
              ? { committed: false as const, failedIndex: 4 }
              : { committed: true as const, results: ops.map(() => ({ row: {} })) };
          }
        }
      }),
      "public",
      "users",
      "import",
      mapping,
      csvStream(`Name,Age,Active,Joined\n${rows}\n`)
    );

    expect(batchSizes).toEqual([250, 1]);
    expect(result).toMatchObject({
      mode: "import",
      rowCount: 251,
      validRows: 251,
      insertedRows: 1,
      failedRows: 250
    });
    if (result.mode === "inspect") throw new Error("Expected an import result.");
    expect(result.errors).toHaveLength(250);
    expect(result.errors[4]?.message).toMatch(/database rejected/i);
    expect(result.errors[0]?.message).toMatch(/line 6 failed/i);
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
    expect(result.errors).toEqual([{ line: 3, message: "The database rejected this row." }]);
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
});
