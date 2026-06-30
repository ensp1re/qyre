# @humb/server

The local HTTP server for Humb, built on Fastify. Exposes a small JSON API the browser UI consumes
plus a `/api/health` endpoint used for verification.

The server reaches databases only through a `DatabaseAdapter`. See
[`ARCHITECTURE.md`](../../ARCHITECTURE.md).
