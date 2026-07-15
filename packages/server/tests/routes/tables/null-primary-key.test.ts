import type { TableMetadata } from "@qyre/core";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../../src/index.js";
import { authHeaders } from "../../helpers/auth.js";
import { makeFakeAdapter } from "../../support/fake-adapter.js";

const NULLABLE_PRIMARY_KEY_TABLE: TableMetadata = {
  schema: "main",
  name: "nullable_keys",
  kind: "table",
  columns: [
    {
      name: "id",
      dataType: "TEXT",
      nullable: true,
      isPrimaryKey: true,
      isForeignKey: false
    },
    {
      name: "name",
      dataType: "TEXT",
      nullable: false,
      isPrimaryKey: false,
      isForeignKey: false
    }
  ],
  permissions: { select: true, insert: true, update: true, delete: true }
};

describe("NULL primary-key row targeting (F137)", () => {
  it("rejects a SQLite update before calling the adapter", async () => {
    const updateRowByKey = vi.fn(async () => ({ matched: 1 }));
    const adapter = makeFakeAdapter({
      engine: "sqlite",
      getTable: async () => NULLABLE_PRIMARY_KEY_TABLE,
      mutations: { updateRowByKey }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tables/main/nullable_keys/rows",
      headers: authHeaders(app),
      payload: { key: { id: null }, changes: { name: "Grace" } }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "Rows with a NULL primary key cannot be targeted."
    });
    expect(updateRowByKey).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects a SQLite delete before calling the adapter", async () => {
    const deleteRowsByKey = vi.fn(async () => ({ deleted: 1 }));
    const adapter = makeFakeAdapter({
      engine: "sqlite",
      getTable: async () => NULLABLE_PRIMARY_KEY_TABLE,
      mutations: { deleteRowsByKey }
    });
    const app = createServer({ adapter });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/tables/main/nullable_keys/rows",
      headers: authHeaders(app),
      payload: { keys: [{ id: null }] }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "Rows with a NULL primary key cannot be targeted."
    });
    expect(deleteRowsByKey).not.toHaveBeenCalled();
    await app.close();
  });
});
