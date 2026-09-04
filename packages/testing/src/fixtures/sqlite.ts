import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { FIXTURE } from "./definitions.js";

export function ensureSqliteFile(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  try {
    const database = new Database(path);
    try {
      const result = database.pragma("quick_check", { simple: true });
      if (result !== "ok")
        throw new Error(`generated SQLite fixture failed quick_check: ${result}`);
    } finally {
      database.close();
    }
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/not a database|unsupported file format|generated SQLite fixture failed/i.test(error.message)
    ) {
      throw error;
    }

    rmSync(path, { force: true });
    new Database(path).close();
  }
}

export function setupSqliteFixture(path: string): void {
  ensureSqliteFile(path);
  const db = new Database(path);
  try {
    db.pragma("busy_timeout = 5000");
    db.transaction(() => {
      db.exec(`DROP TABLE IF EXISTS ${FIXTURE.table}`);
      db.exec(
        `CREATE TABLE ${FIXTURE.table} (
           id INTEGER PRIMARY KEY,
           name TEXT NOT NULL,
           email TEXT NOT NULL
         )`
      );
      const insertRow = db.prepare(`INSERT INTO ${FIXTURE.table} (name, email) VALUES (?, ?)`);
      insertRow.run("Ada Lovelace", "ada@example.com");
      insertRow.run("Alan Turing", "alan@example.com");
      insertRow.run("Grace Hopper", "grace@example.com");
    })();
  } finally {
    db.close();
  }
}
