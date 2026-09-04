import mysql from "mysql2/promise";
import { FIXTURE, MYSQL_RELATIONSHIP_FIXTURE } from "./definitions.js";

const MYSQL_FIXTURE_LOCK_NAME = "qyre_fixture_lock";
const MYSQL_READONLY_USER = "qyre_readonly";
const MYSQL_WRITER_ROLE = "qyre_writer_role";
const MYSQL_ROLE_WRITER_USER = "qyre_role_writer";

function quoteMysqlDatabaseIdentifier(connectionString: string): string {
  const database = new URL(connectionString).pathname.slice(1);
  if (!database) throw new Error("MySQL fixture URL must include a database name.");
  return `\`${decodeURIComponent(database).replace(/`/g, "``")}\``;
}

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
