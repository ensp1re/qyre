# Server structure

The server follows Fastify's plugin encapsulation model. See
[`../../docs/CODE_ORGANIZATION.md`](../../docs/CODE_ORGANIZATION.md) for the complete contract.

One plausible result, to be confirmed against the current handlers before moving files, is:

```text
src/app.ts
src/index.ts
src/routes/<resource>.ts
src/services/<concern>.ts
src/plugins/<concern>.ts
tests/routes/<resource>.test.ts
tests/services/<concern>.test.ts
tests/integration/<journey>.test.ts
```

The invariant is Fastify plugin encapsulation and clear ownership, not these exact folder names.
The public entrypoint should remain small, route modules should own cohesive HTTP resources, and
test paths should mirror their source owner.

The current large `src/index.ts` and `src/index.test.ts` predate this contract and are migration
debt in Plan 0005; do not add unrelated behavior to them.
