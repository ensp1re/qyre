import type { MongoClient } from "mongodb";
import { describe, expect, it } from "vitest";
import { MongodbAdapter } from "../../src/runtime/adapter.js";
import { fakeMongoClient } from "../support/fake-client.js";

function connectedAdapter(client: MongoClient): MongodbAdapter {
  const adapter = new MongodbAdapter({ engine: "mongodb", raw: "mongodb://localhost/app" });
  (adapter as unknown as { client: MongoClient }).client = client;
  return adapter;
}

describe("MongodbAdapter.getRows", () => {
  it("types filters from the server-resolved column type without re-sampling the collection", async () => {
    const { client, calls } = fakeMongoClient();
    await connectedAdapter(client).getRows("app", "items", 1, 50, undefined, [
      { column: "score", op: "gt", value: "5", columnDataType: "number" }
    ]);
    expect(calls.map((call) => call.method)).not.toContain("aggregate");
    const find = calls.find((call) => call.method === "find");
    expect(find?.args[0]).toEqual({ $and: [{ score: { $gt: 5 } }] });
  });

  it("appends _id as the final sort key so skip/limit pages are deterministic", async () => {
    const { client, calls } = fakeMongoClient();
    const adapter = connectedAdapter(client);
    await adapter.getRows("app", "items", 1, 50, { column: "name", direction: "desc" });
    await adapter.getRows("app", "items", 1, 50, { column: "_id", direction: "desc" });
    await adapter.getRows("app", "items", 1, 50);
    const sorts = calls.filter((call) => call.method === "sort").map((call) => call.args[0]);
    expect(sorts).toEqual([{ name: -1, _id: 1 }, { _id: -1 }, { _id: 1 }]);
  });
});

describe("MongodbAdapter.streamRows", () => {
  it("uses the same _id tiebreaker as paged reads", async () => {
    const { client, calls } = fakeMongoClient();
    const rows = connectedAdapter(client).streamRows("app", "items", [], {
      column: "name",
      direction: "asc"
    });
    for await (const row of rows) void row;
    expect(calls.find((call) => call.method === "sort")?.args[0]).toEqual({ name: 1, _id: 1 });
  });
});
