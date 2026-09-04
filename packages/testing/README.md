# @qyre/testing

Internal (private) test utilities and fixtures for Qyre: test-database helpers, fixture setup,
cross-process E2E engine isolation, and shared verification helpers.

The root entrypoint contains only database-independent helpers. Engine fixtures are available from
`@qyre/testing/postgres`, `@qyre/testing/mysql`, `@qyre/testing/sqlite`, and
`@qyre/testing/mongodb`, so consumers that do not use SQLite do not load its native addon.

Not published and not part of Qyre's public API.
