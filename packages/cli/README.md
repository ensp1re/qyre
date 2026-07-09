# qyre

The `qyre` CLI launches a local-first database management UI from your terminal.

```bash
npx qyre postgres://user:pass@localhost:5432/mydb
```

It parses the target, starts the local server, opens your browser, and shuts down cleanly on
`Ctrl+C`. Supports Postgres, MySQL, SQLite, and MongoDB. See
[`docs/product-specs/connect-and-inspect-postgres.md`](../../docs/product-specs/connect-and-inspect-postgres.md)
and the other `connect-and-inspect-*.md` specs per engine.

Always include the package name - `npx <connection-url>` on its own (without `qyre`) fails with
npm's own `EUNSUPPORTEDPROTOCOL` error, since npx parses the URL itself as a package spec before
qyre ever runs. If you'd rather not build a URL by hand, run the guided prompt instead:

```bash
npx qyre --login
```

`--login` asks for an engine, then user, password (masked), host, port, and database, retrying the
connection attempt if it fails. The same prompt fills in just the missing user/password when you
give a URL with no credentials (e.g. `npx qyre postgres://localhost:5432/mydb`).
