-- Restricted MySQL fixtures for permission introspection tests (F093). Also created idempotently
-- at test-setup time (packages/testing's setupMysqlFixture), which is what actually makes this
-- work in CI service containers too (GitHub Actions' `services:` blocks don't support this
-- docker-entrypoint-initdb.d volume mount) - this file only saves a local `docker compose up` from
-- needing to run the test suite once before the fixtures exist.
CREATE USER IF NOT EXISTS 'qyre_readonly'@'%' IDENTIFIED BY 'qyre_readonly';
GRANT SELECT ON qyre_test.* TO 'qyre_readonly'@'%';

-- qyre_role_writer's write grants come only from an active default role, never a direct grant on
-- the user itself - the exact case plain information_schema.TABLE_PRIVILEGES/SCHEMA_PRIVILEGES
-- (and even ROLE_TABLE_GRANTS, which only sees exact-table role grants) would miss entirely. See
-- packages/drivers/mysql/src/permissions.ts's top comment for why introspection reads SHOW GRANTS
-- instead of those views.
CREATE ROLE IF NOT EXISTS 'qyre_writer_role';
GRANT INSERT, UPDATE, DELETE ON qyre_test.* TO 'qyre_writer_role';
CREATE USER IF NOT EXISTS 'qyre_role_writer'@'%' IDENTIFIED BY 'qyre_role_writer';
GRANT SELECT ON qyre_test.* TO 'qyre_role_writer'@'%';
GRANT 'qyre_writer_role' TO 'qyre_role_writer'@'%';
SET DEFAULT ROLE 'qyre_writer_role' TO 'qyre_role_writer'@'%';
