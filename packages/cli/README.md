# humb

The `humb` CLI launches a local-first database management UI from your terminal.

```bash
npx humb postgres://user:pass@localhost:5432/mydb
```

It parses the target, starts the local server, opens your browser, and shuts down cleanly on
`Ctrl+C`. Supports Postgres, MySQL, SQLite, and MongoDB. See
[`docs/product-specs/connect-and-inspect-postgres.md`](../../docs/product-specs/connect-and-inspect-postgres.md)
and the other `connect-and-inspect-*.md` specs per engine.
