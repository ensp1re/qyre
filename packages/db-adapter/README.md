# @humb/db-adapter

Engine-agnostic database adapter contracts. Concrete engines implement `DatabaseAdapter`.

To add a new engine, create a `db-<engine>` package that implements these interfaces. See
[`ARCHITECTURE.md`](../../ARCHITECTURE.md).
