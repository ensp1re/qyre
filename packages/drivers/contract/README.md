# @humbdb/driver-contract

Engine-agnostic database adapter contracts. Concrete engine drivers implement `DatabaseAdapter`.

To add a new engine, create a `packages/drivers/<engine>` package that implements these interfaces.
See [`ARCHITECTURE.md`](../../../ARCHITECTURE.md).
