import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";
import { makeFakeAdapter } from "../support/fake-adapter.js";

const columns = [
  { name: "name", dataType: "varchar", nullable: false, isPrimaryKey: false, isForeignKey: false }
];

function writableAdapter() {
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
      commitBatch: async (ops) => ({ committed: true, results: ops.map(() => ({ row: {} })) })
    }
  });
}

function multipart(
  fields: Array<[string, string]>,
  csv: string,
  filename = "users.csv"
): { body: Buffer; contentType: string } {
  const boundary = "qyre-csv-import-boundary";
  const chunks = fields.map(
    ([name, value]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
  );
  chunks.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`
  );
  return {
    body: Buffer.from(chunks.join("")),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

describe("POST /api/tables/:schema/:table/import.csv", () => {
  it("streams an inspection response from a multipart upload", async () => {
    const app = createServer({ adapter: writableAdapter() });
    const upload = multipart([["mode", "inspect"]], "Name\nAda\n");

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/users/import.csv",
      headers: { ...authHeaders(app), "content-type": upload.contentType },
      payload: upload.body
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      mode: "inspect",
      headers: ["Name"],
      rowCount: 1,
      preview: [{ line: 2, values: { Name: "Ada" } }]
    });
    await app.close();
  });

  it("imports with mapping fields that precede the file", async () => {
    const app = createServer({ adapter: writableAdapter() });
    const upload = multipart(
      [
        ["mode", "import"],
        ["mapping", JSON.stringify({ Name: "name" })]
      ],
      "Name\nAda\nGrace\n"
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/tables/public/users/import.csv",
      headers: { ...authHeaders(app), "content-type": upload.contentType },
      payload: upload.body
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ insertedRows: 2, failedRows: 0 });
    await app.close();
  });

  it("rejects non-multipart, non-CSV, and read-only requests", async () => {
    const app = createServer({ adapter: writableAdapter() });
    const plain = await app.inject({
      method: "POST",
      url: "/api/tables/public/users/import.csv",
      headers: authHeaders(app),
      payload: {}
    });
    expect(plain.statusCode).toBe(400);

    const wrongFile = multipart([["mode", "inspect"]], "Name\nAda\n", "users.txt");
    const wrongFileResponse = await app.inject({
      method: "POST",
      url: "/api/tables/public/users/import.csv",
      headers: { ...authHeaders(app), "content-type": wrongFile.contentType },
      payload: wrongFile.body
    });
    expect(wrongFileResponse.statusCode).toBe(400);
    await app.close();

    const readOnlyApp = createServer({ adapter: writableAdapter(), readOnly: true });
    const upload = multipart([["mode", "inspect"]], "Name\nAda\n");
    const readOnly = await readOnlyApp.inject({
      method: "POST",
      url: "/api/tables/public/users/import.csv",
      headers: { ...authHeaders(readOnlyApp), "content-type": upload.contentType },
      payload: upload.body
    });
    expect(readOnly.statusCode).toBe(403);
    await readOnlyApp.close();
  });
});
