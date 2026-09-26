import type { ConformanceFixture } from "./fixtures/engine-cases.js";
import { cases } from "./fixtures/engine-cases.js";
import type { DatabaseAdapter } from "@qyre/driver-contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// MongoDB has no SQL runner, so every case here is SQL-engine only.
describe.each(cases.filter((each) => each.engine !== "mongodb"))(
  "SQL console conformance: $name",
  ({ name, envVar, factory, engine, setup }) => {
    const configured = envVar === "" || Boolean(process.env[envVar]?.trim());

    let adapter: DatabaseAdapter;
    let fixture: ConformanceFixture;
    let teardown: () => Promise<void>;

    beforeAll(async () => {
      if (!configured) return;
      const result = await setup();
      if (!result) throw new Error(`${name}: setup() unexpectedly returned undefined`);
      fixture = result.fixture;
      teardown = result.teardown;
      adapter = factory.create({ engine, raw: result.raw });
      await adapter.connect();
    });

    afterAll(async () => {
      await adapter?.disconnect();
      await teardown?.();
    });

    const allRows = () => adapter.getRows(fixture.schema, fixture.populatedTable, 0, 100);

    it.skipIf(!configured)(
      "rejects statements smuggled past comment markers inside literals on run and explain",
      async () => {
        const before = await allRows();
        const table = fixture.populatedTable;
        const payloads = [
          `SELECT '/*'; COMMIT; DROP TABLE ${table}; SELECT '*/'`,
          `SELECT '--'; DELETE FROM ${table}; SELECT 1`,
          `EXPLAIN SELECT '/*'; COMMIT; DELETE FROM ${table}; SELECT '*/'`
        ];
        for (const sql of payloads) {
          await expect(adapter.runReadOnlyQuery(sql), sql).rejects.toThrow("Multiple statements");
          await expect(adapter.explainQuery!(sql), sql).rejects.toThrow("Multiple statements");
        }
        const after = await allRows();
        expect(after.rows).toEqual(before.rows);
      }
    );

    it.skipIf(!configured)("keeps every value when result column names repeat", async () => {
      const page = await adapter.runReadOnlyQuery(
        `SELECT a.n, b.n, a.label FROM ${fixture.populatedTable} a
           CROSS JOIN ${fixture.populatedTable} b WHERE a.n = 1 AND b.n = 2`
      );
      expect(page.columns).toEqual(["n", "n_2", "label"]);
      expect(page.rows).toEqual([{ n: 1, n_2: 2, label: "apple" }]);
    });

    it.skipIf(!configured)("runs a query that ends in a line comment", async () => {
      for (const sql of [
        `SELECT n FROM ${fixture.populatedTable} WHERE n = 1 -- recent`,
        `SELECT n FROM ${fixture.populatedTable} WHERE n = 1;\n-- trailing note`,
        `SELECT n FROM ${fixture.populatedTable} WHERE n = 1 /* a */ ; /* b */`
      ]) {
        const page = await adapter.runReadOnlyQuery(sql);
        expect(page.rows, sql).toEqual([{ n: 1 }]);
      }
    });
  }
);
