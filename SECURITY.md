# Security Policy

Qyre connects to real databases, so security reports are taken seriously and handled with
priority.

## Supported versions

Only the latest release published to npm ([`qyre`](https://www.npmjs.com/package/qyre)) receives
security fixes. There are no maintenance branches for older versions.

## Reporting a vulnerability

**Do not open a public GitHub issue for a security vulnerability.**

Report it privately via GitHub's private vulnerability reporting:
[github.com/ensp1re/qyre/security/advisories/new](https://github.com/ensp1re/qyre/security/advisories/new).

Include what you can of: the affected version, a reproduction (connection setup, request, or UI
steps), and the impact you believe it has. You should receive an initial response within a few
days; please allow a fix to be released before public disclosure.

## Scope and security model

Qyre is a local-first, single-developer tool: the server binds to `127.0.0.1` only, every API
request requires a per-session bearer token, and a `Host`-header guard closes the DNS-rebinding
vector. Defending a genuinely shared or multi-tenant machine is explicitly out of the trust model
(another OS user on the same host can reach the port the same way the browser does) - reports
within that boundary are accepted limitations, not vulnerabilities.

In scope, for example: read-only enforcement bypasses (`--read-only` or the engine-level read-only
backstops), credential leakage into logs/exports/errors, SQL injection through Qyre's own
parameterized paths, cross-origin access to the local API, and CSV formula-injection regressions.

The full internal security contract this project holds itself to - including the read-only
enforcement design and redaction rules - is documented in
[`docs/SECURITY.md`](docs/SECURITY.md).
