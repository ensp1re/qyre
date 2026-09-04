export const TEST_DB_ENV = "QYRE_TEST_DATABASE_URL";
export const TEST_READONLY_DB_ENV = "QYRE_TEST_READONLY_DATABASE_URL";
export const TEST_SQLITE_ENV = "QYRE_TEST_SQLITE_PATH";
export const TEST_MYSQL_ENV = "QYRE_TEST_MYSQL_URL";
export const TEST_READONLY_MYSQL_ENV = "QYRE_TEST_READONLY_MYSQL_URL";
export const TEST_ROLE_WRITER_MYSQL_ENV = "QYRE_TEST_ROLE_WRITER_MYSQL_URL";
export const TEST_MONGO_ENV = "QYRE_TEST_MONGO_URL";

export function isTestDatabaseConfigured(): boolean {
  return Boolean(process.env[TEST_DB_ENV]?.trim());
}

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

export function requireReadOnlyTestDatabaseUrl(primaryConnectionString: string): string {
  const configured = process.env[TEST_READONLY_DB_ENV]?.trim();
  if (configured) return configured;

  const url = new URL(primaryConnectionString);
  url.username = "qyre_readonly";
  url.password = "qyre_readonly";
  return url.toString();
}

export function requireTestSqlitePath(): string {
  const path = process.env[TEST_SQLITE_ENV]?.trim();
  if (!path) {
    throw new Error(
      `${TEST_SQLITE_ENV} is not set. This verification requires a SQLite fixture file path.`
    );
  }
  return path;
}

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

export function requireReadOnlyTestMysqlUrl(primaryConnectionString: string): string {
  const configured = process.env[TEST_READONLY_MYSQL_ENV]?.trim();
  if (configured) return configured;

  const url = new URL(primaryConnectionString);
  url.username = "qyre_readonly";
  url.password = "qyre_readonly";
  return url.toString();
}

export function requireRoleWriterTestMysqlUrl(primaryConnectionString: string): string {
  const configured = process.env[TEST_ROLE_WRITER_MYSQL_ENV]?.trim();
  if (configured) return configured;

  const url = new URL(primaryConnectionString);
  url.username = "qyre_role_writer";
  url.password = "qyre_role_writer";
  return url.toString();
}

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
