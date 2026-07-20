---
name: New engine request
about: Ask for (or offer to build) support for another database engine
title: "Engine: "
labels: enhancement
assignees: ""
---

## Engine

<!-- Name and typical connection form, e.g. DuckDB - `duckdb ./data.duckdb`,
CockroachDB - `postgres://...`. -->

## Why it fits Qyre

<!-- Who uses it and what they'd inspect/edit. Local-first single-command
connection should make sense for it. -->

## Data model notes

<!-- Relational like Postgres/MySQL/SQLite, or document-shaped like MongoDB?
Anything unusual (no schemas, no SQL, embedded-only, ...) worth knowing before
scoping an adapter. -->

## Are you offering to build it?

<!-- Drivers are additive by design: a new `packages/drivers/<engine>` package,
picked up by the same detection path, no engine branches in the UI. The
`@qyre/testing-conformance` suite defines "behaves like the existing four."
Say if you want to take it on and we'll agree scope here first. -->
