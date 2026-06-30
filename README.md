# Humb

Humb is a local-first database management UI you can launch straight from your terminal, without
installing a heavy database IDE.

```bash
npx humb postgres://user:pass@localhost:5432/mydb
```

The command starts a local server, opens your browser, and lets you inspect and manage your
database through a clean web interface. Humb targets PostgreSQL first; the architecture is designed
so new database engines can be added as independent adapter packages.

## Status

Early skeleton. This repository is set up as an agent-first monorepo. Most product behavior is not
implemented yet; the structure, rules, and verification gates come first.

## Quick start (development)

```bash
pnpm install
pnpm check        # format, lint, typecheck, test, build, project-state checks
pnpm dev          # run packages in watch mode
```

## Repository map

This repo is optimized to be legible to both humans and AI coding agents.

- [`AGENTS.md`](AGENTS.md) - start here if you are an agent. Short routing layer into the docs.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) - system map, layers, and package boundaries.
- [`FRONTEND.md`](FRONTEND.md) - UI rules and constraints.
- [`docs/`](docs/) - the system of record: product specs, plans, quality, reliability, security.
- [`apps/web`](apps/web) - the browser UI.
- [`packages/`](packages/) - CLI, server, core contracts, database adapters, UI kit, and config.

## Contributing

Humb follows a strict "the repository is the spec" model. Before changing code, read
[`AGENTS.md`](AGENTS.md) and the relevant docs. A change is only done when it is verified by
runnable evidence and the repository can still build, test, and restart cleanly.

## License

[MIT](LICENSE)
