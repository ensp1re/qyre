import { randomUUID } from "node:crypto";
import { requireTestMysqlUrl } from "@qyre/testing";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MysqlAdapter } from "../../src/index.js";

const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
const parent = `qyre_intro_parent_${suffix}`;
const child = `qyre_intro_child_${suffix}`;
const readable = `qyre_intro_readable_${suffix}`;
const writeOnly = `qyre_intro_write_only_${suffix}`;
const user = `qyre_insert_only_${suffix}`;
const password = randomUUID();

describe("MysqlAdapter introspection", () => {
  let databaseUrl: string;
  let databaseName: string;
  let pool: mysql.Pool;
  let adapter: MysqlAdapter;
  let restricted: MysqlAdapter;

  beforeAll(async () => {
    databaseUrl = requireTestMysqlUrl();
    databaseName = new URL(databaseUrl).pathname.slice(1);
    const database = `\`${databaseName.replace(/`/g, "``")}\``;
    pool = mysql.createPool(databaseUrl);
    await pool.query(`CREATE TABLE ${parent} (x INT, y INT, PRIMARY KEY (x, y))`);
    await pool.query(
      `CREATE TABLE ${child} (id INT PRIMARY KEY, a INT, b INT,
         FOREIGN KEY (a, b) REFERENCES ${parent} (x, y))`
    );
    await pool.query(`CREATE TABLE ${readable} (id INT PRIMARY KEY)`);
    await pool.query(`CREATE TABLE ${writeOnly} (id INT PRIMARY KEY, note TEXT)`);
    await pool.query(`CREATE USER '${user}'@'%' IDENTIFIED BY '${password}'`);
    await pool.query(`GRANT SELECT ON ${database}.${readable} TO '${user}'@'%'`);
    await pool.query(`GRANT INSERT ON ${database}.${writeOnly} TO '${user}'@'%'`);
    adapter = new MysqlAdapter({ engine: "mysql", raw: databaseUrl });
    await adapter.connect();
    const url = new URL(databaseUrl);
    url.username = user;
    url.password = password;
    restricted = new MysqlAdapter({ engine: "mysql", raw: url.toString() });
    await restricted.connect();
  });

  afterAll(async () => {
    await restricted?.disconnect();
    await adapter?.disconnect();
    await pool.query(`DROP USER IF EXISTS '${user}'@'%'`);
    await pool.query(`DROP TABLE IF EXISTS ${child}, ${parent}, ${readable}, ${writeOnly}`);
    await pool.end();
  });

  it("pairs composite foreign-key columns with their referenced columns by position", async () => {
    const single = await adapter.getTable(databaseName, child);
    const batched = (await adapter.getAllTables()).find(
      (table) => table.schema === databaseName && table.name === child
    );
    for (const table of [single, batched]) {
      expect(table?.columns.find((column) => column.name === "a")?.references).toEqual({
        schema: databaseName,
        table: parent,
        column: "x"
      });
      expect(table?.columns.find((column) => column.name === "b")?.references).toEqual({
        schema: databaseName,
        table: parent,
        column: "y"
      });
    }
  });

  it("reports an unknown count for a table the user cannot SELECT from", async () => {
    const tables = await restricted.getAllTables();
    const byName = (name: string) =>
      tables.find((table) => table.schema === databaseName && table.name === name);
    expect(byName(readable)?.rowCount).toBe(0);
    expect(byName(writeOnly)).toBeDefined();
    expect(byName(writeOnly)?.rowCount).toBeUndefined();

    const table = await restricted.getTable(databaseName, writeOnly);
    expect(table.rowCount).toBeUndefined();
    expect(table.permissions).toMatchObject({ select: false, insert: true });
  });
});
