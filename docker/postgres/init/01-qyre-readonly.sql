-- Restricted Postgres fixture for permission introspection tests (F092).
CREATE ROLE qyre_readonly LOGIN PASSWORD 'qyre_readonly';
GRANT CONNECT ON DATABASE qyre_test TO qyre_readonly;
GRANT USAGE ON SCHEMA public TO qyre_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO qyre_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO qyre_readonly;
