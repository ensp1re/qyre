import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { MongoClient, ObjectId } from "mongodb";
import mysql from "mysql2/promise";
import { Pool } from "pg";

export {
  acquireFixtureEngineLocks,
  fixtureEngineForProject,
  type FixtureEngine,
  type FixtureEngineLock
} from "./e2e/fixture-isolation.js";

/** Environment variable that holds the Postgres URL used by integration and end-to-end tests. */
export const TEST_DB_ENV = "QYRE_TEST_DATABASE_URL";

/** Optional override for the restricted Postgres fixture user. */
export const TEST_READONLY_DB_ENV = "QYRE_TEST_READONLY_DATABASE_URL";

/** Environment variable that holds the SQLite fixture file path used by end-to-end tests. */
export const TEST_SQLITE_ENV = "QYRE_TEST_SQLITE_PATH";

/** Environment variable that holds the MySQL URL used by integration and end-to-end tests. */
export const TEST_MYSQL_ENV = "QYRE_TEST_MYSQL_URL";

/** Optional override for the restricted MySQL fixture user. */
export const TEST_READONLY_MYSQL_ENV = "QYRE_TEST_READONLY_MYSQL_URL";

/** Optional override for the MySQL fixture user whose write grants come from an active default role. */
export const TEST_ROLE_WRITER_MYSQL_ENV = "QYRE_TEST_ROLE_WRITER_MYSQL_URL";

/** Environment variable that holds the MongoDB URL used by integration tests. */
export const TEST_MONGO_ENV = "QYRE_TEST_MONGO_URL";

/** Whether a test database is configured in the environment. */
export function isTestDatabaseConfigured(): boolean {
  return Boolean(process.env[TEST_DB_ENV]?.trim());
}

/** Return the configured test database URL or throw when verification is unconfigured. */
export function requireTestDatabaseUrl(): string {
  const url = process.env[TEST_DB_ENV]?.trim();
  if (!url) {
    throw new Error(
      `${TEST_DB_ENV} is not set. This verification requires a Postgres database.\n` +
        `Set it, for example:\n` +
        `  export ${TEST_DB_ENV}="postgres://postgres:postgres@localhost:5432/qyre_test"\n` +
        `or start one with Docker:\n` +
        `  docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`
    );
  }
  return url;
}

/** Return the restricted fixture user's URL. It defaults to the configured Postgres target so
 * Docker Compose and CI need only configure the normal admin fixture URL. */
export function requireReadOnlyTestDatabaseUrl(primaryConnectionString: string): string {
  const configured = process.env[TEST_READONLY_DB_ENV]?.trim();
  if (configured) return configured;

  const url = new URL(primaryConnectionString);
  url.username = "qyre_readonly";
  url.password = "qyre_readonly";
  return url.toString();
}

/** Return the configured SQLite fixture path or throw when verification is unconfigured. */
export function requireTestSqlitePath(): string {
  const path = process.env[TEST_SQLITE_ENV]?.trim();
  if (!path) {
    throw new Error(
      `${TEST_SQLITE_ENV} is not set. This verification requires a SQLite fixture file path.`
    );
  }
  return path;
}

/** Return the configured MySQL test database URL or throw when verification is unconfigured. */
export function requireTestMysqlUrl(): string {
  const url = process.env[TEST_MYSQL_ENV]?.trim();
  if (!url) {
    throw new Error(
      `${TEST_MYSQL_ENV} is not set. This verification requires a MySQL database.\n` +
        `Set it, for example:\n` +
        `  export ${TEST_MYSQL_ENV}="mysql://root:root@localhost:3306/qyre_test"\n` +
        `or start one with Docker:\n` +
        `  docker run --rm -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=qyre_test -p 3306:3306 mysql:8`
    );
  }
  return url;
}

/** Return the restricted MySQL fixture user's URL. Defaults to the configured MySQL
 * target so Docker Compose and CI need only configure the normal admin fixture URL. */
export function requireReadOnlyTestMysqlUrl(primaryConnectionString: string): string {
  const configured = process.env[TEST_READONLY_MYSQL_ENV]?.trim();
  if (configured) return configured;

  const url = new URL(primaryConnectionString);
  url.username = "qyre_readonly";
  url.password = "qyre_readonly";
  return url.toString();
}

/** Return the role-only-writer MySQL fixture user's URL. */
export function requireRoleWriterTestMysqlUrl(primaryConnectionString: string): string {
  const configured = process.env[TEST_ROLE_WRITER_MYSQL_ENV]?.trim();
  if (configured) return configured;

  const url = new URL(primaryConnectionString);
  url.username = "qyre_role_writer";
  url.password = "qyre_role_writer";
  return url.toString();
}

/** Return the configured MongoDB test database URL or throw when verification is unconfigured. */
export function requireTestMongoUrl(): string {
  const url = process.env[TEST_MONGO_ENV]?.trim();
  if (!url) {
    throw new Error(
      `${TEST_MONGO_ENV} is not set. This verification requires a MongoDB database.\n` +
        `Set it, for example:\n` +
        `  export ${TEST_MONGO_ENV}="mongodb://localhost:27017/qyre_test"\n` +
        `or start one with Docker:\n` +
        `  docker run --rm -p 27017:27017 mongo:7`
    );
  }
  return url;
}

/** The fixture table the connect-and-inspect journey expects to find. */
export const FIXTURE = {
  schema: "public",
  table: "qyre_demo_users",
  rowCount: 3
} as const;

const READONLY_POSTGRES_ROLE = "qyre_readonly";

/** Child fixture table used where relationship introspection needs a stable FK. */
export const MYSQL_RELATIONSHIP_FIXTURE = {
  table: "qyre_demo_orders",
  rowCount: 2
} as const;

/** Arbitrary fixed key for setupFixture's advisory lock - scoped to this one fixture, not shared. */
const FIXTURE_LOCK_KEY = 958312;

/** Create the shared Postgres fixture under an advisory lock. */
export async function setupFixture(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [FIXTURE_LOCK_KEY]);
    try {
      await client.query(`DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${READONLY_POSTGRES_ROLE}') THEN
            CREATE ROLE ${READONLY_POSTGRES_ROLE} LOGIN PASSWORD '${READONLY_POSTGRES_ROLE}';
          END IF;
        END
      $$`);
      await client.query(
        `GRANT CONNECT ON DATABASE ${quoteDatabaseIdentifier(connectionString)} TO ${READONLY_POSTGRES_ROLE}`
      );
      await client.query(`GRANT USAGE ON SCHEMA public TO ${READONLY_POSTGRES_ROLE}`);
      await client.query(
        `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${READONLY_POSTGRES_ROLE}`
      );
      await client.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${READONLY_POSTGRES_ROLE}`
      );
      await client.query(`CREATE TABLE IF NOT EXISTS ${FIXTURE.table} (
         id serial PRIMARY KEY,
         name text NOT NULL,
         email text NOT NULL,
         profile jsonb
       )`);
      await client.query("BEGIN");
      try {
        await client.query(`TRUNCATE TABLE ${FIXTURE.table} RESTART IDENTITY`);
        await client.query(`INSERT INTO ${FIXTURE.table} (name, email, profile) VALUES
           ('Ada Lovelace', 'ada@example.com', '{"account":{"tags":["admin","beta"]}}'),
           ('Alan Turing', 'alan@example.com', NULL),
           ('Grace Hopper', 'grace@example.com', NULL)`);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [FIXTURE_LOCK_KEY]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

function quoteDatabaseIdentifier(connectionString: string): string {
  const database = new URL(connectionString).pathname.slice(1);
  if (!database) throw new Error("Postgres fixture URL must include a database name.");
  return `"${decodeURIComponent(database).replace(/"/g, '""')}"`;
}

/** Run raw SQL statements sequentially in one pool. */
export async function runStatements(connectionString: string, statements: string[]): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    for (const statement of statements) {
      await pool.query(statement);
    }
  } finally {
    await pool.end();
  }
}

/** Ensure a valid SQLite fixture file exists before the read-only server opens it. */
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

/** Recreate the SQLite fixture atomically so concurrent workers cannot observe partial state. */
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

/** Arbitrary fixed name for setupMysqlFixture's named lock - scoped to this one fixture, not shared. */
const MYSQL_FIXTURE_LOCK_NAME = "qyre_fixture_lock";

const MYSQL_READONLY_USER = "qyre_readonly";
const MYSQL_WRITER_ROLE = "qyre_writer_role";
const MYSQL_ROLE_WRITER_USER = "qyre_role_writer";

function quoteMysqlDatabaseIdentifier(connectionString: string): string {
  const database = new URL(connectionString).pathname.slice(1);
  if (!database) throw new Error("MySQL fixture URL must include a database name.");
  return `\`${decodeURIComponent(database).replace(/`/g, "``")}\``;
}

/** Create the MySQL fixture while serializing workers with a named lock. */
export async function setupMysqlFixture(connectionString: string): Promise<void> {
  const pool = mysql.createPool(connectionString);
  const connection = await pool.getConnection();
  try {
    await connection.query("SELECT GET_LOCK(?, 10)", [MYSQL_FIXTURE_LOCK_NAME]);
    try {
      const databaseIdent = quoteMysqlDatabaseIdentifier(connectionString);

      await connection.query(
        `CREATE USER IF NOT EXISTS '${MYSQL_READONLY_USER}'@'%' IDENTIFIED BY '${MYSQL_READONLY_USER}'`
      );
      await connection.query(`GRANT SELECT ON ${databaseIdent}.* TO '${MYSQL_READONLY_USER}'@'%'`);

      await connection.query(`CREATE ROLE IF NOT EXISTS '${MYSQL_WRITER_ROLE}'`);
      await connection.query(
        `GRANT INSERT, UPDATE, DELETE ON ${databaseIdent}.* TO '${MYSQL_WRITER_ROLE}'`
      );
      await connection.query(
        `CREATE USER IF NOT EXISTS '${MYSQL_ROLE_WRITER_USER}'@'%' IDENTIFIED BY '${MYSQL_ROLE_WRITER_USER}'`
      );
      await connection.query(
        `GRANT SELECT ON ${databaseIdent}.* TO '${MYSQL_ROLE_WRITER_USER}'@'%'`
      );
      await connection.query(`GRANT '${MYSQL_WRITER_ROLE}' TO '${MYSQL_ROLE_WRITER_USER}'@'%'`);
      await connection.query(
        `SET DEFAULT ROLE '${MYSQL_WRITER_ROLE}' TO '${MYSQL_ROLE_WRITER_USER}'@'%'`
      );

      await connection.query(`CREATE TABLE IF NOT EXISTS ${FIXTURE.table} (
         id INT AUTO_INCREMENT PRIMARY KEY,
         name VARCHAR(255) NOT NULL,
         email VARCHAR(255) NOT NULL
       )`);
      await connection.query(`CREATE TABLE IF NOT EXISTS ${MYSQL_RELATIONSHIP_FIXTURE.table} (
         id INT AUTO_INCREMENT PRIMARY KEY,
         user_id INT NOT NULL,
         total DECIMAL(10,2) NOT NULL,
         FOREIGN KEY (user_id) REFERENCES ${FIXTURE.table}(id)
       )`);
      await connection.beginTransaction();
      try {
        await connection.query(`DELETE FROM ${MYSQL_RELATIONSHIP_FIXTURE.table}`);
        await connection.query(`DELETE FROM ${FIXTURE.table}`);
        await connection.query(`INSERT INTO ${FIXTURE.table} (id, name, email) VALUES
           (1, 'Ada Lovelace', 'ada@example.com'),
           (2, 'Alan Turing', 'alan@example.com'),
           (3, 'Grace Hopper', 'grace@example.com')`);
        await connection.query(
          `INSERT INTO ${MYSQL_RELATIONSHIP_FIXTURE.table} (id, user_id, total) VALUES
           (1, 1, 42.50),
           (2, 2, 13.99)`
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    } finally {
      await connection.query("SELECT RELEASE_LOCK(?)", [MYSQL_FIXTURE_LOCK_NAME]);
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

/** Create the shared MongoDB fixture with fixed IDs and idempotent replacement upserts. */
export async function setupMongoFixture(connectionString: string): Promise<void> {
  const databaseName = new URL(connectionString).pathname.slice(1) || "qyre_test";
  const client = new MongoClient(connectionString);
  try {
    await client.connect();
    const db = client.db(databaseName);
    const collection = db.collection(FIXTURE.table);
    const documents = [
      {
        _id: new ObjectId("000000000000000000000001"),
        name: "Ada Lovelace",
        email: "ada@example.com",
        profile: { account: { tags: ["admin", "beta"] } }
      },
      {
        _id: new ObjectId("000000000000000000000002"),
        name: "Alan Turing",
        email: "alan@example.com"
      },
      {
        _id: new ObjectId("000000000000000000000003"),
        name: "Grace Hopper",
        email: "grace@example.com"
      }
    ];
    await collection.bulkWrite(
      documents.map((document) => ({
        replaceOne: { filter: { _id: document._id }, replacement: document, upsert: true }
      }))
    );
    await collection.deleteMany({ _id: { $nin: documents.map((document) => document._id) } });
  } finally {
    await client.close();
  }
}
