import { describe, expect, it } from "vitest";
import { formatRowExport } from "../../src/services/rows/row-export.js";
import { makeFakeAdapter } from "../support/fake-adapter.js";

async function collect(chunks: AsyncIterable<string>): Promise<string> {
  let output = "";
  for await (const chunk of chunks) output += chunk;
  return output;
}

async function* noRows(): AsyncIterable<Record<string, unknown>> {}

describe("formatRowExport", () => {
  it("writes metadata columns for an empty CSV and a valid empty JSON array", async () => {
    const db = makeFakeAdapter();

    await expect(
      collect(formatRowExport(db, "csv", "public", "users", ["id"], noRows()))
    ).resolves.toBe("id\n");
    await expect(
      collect(formatRowExport(db, "json", "public", "users", ["id"], noRows()))
    ).resolves.toBe("[]\n");
  });

  it("serializes bigint values without buffering or throwing", async () => {
    async function* rows() {
      yield { id: 9_007_199_254_740_993n };
    }

    await expect(
      collect(formatRowExport(makeFakeAdapter(), "json", "public", "users", ["id"], rows()))
    ).resolves.toBe('[\n{"id":"9007199254740993"}\n]\n');
  });

  it("rejects SQL output when the adapter has no SQL formatter", async () => {
    await expect(
      collect(formatRowExport(makeFakeAdapter(), "sql", "public", "users", [], noRows()))
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
