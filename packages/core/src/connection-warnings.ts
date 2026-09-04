/**
 * Transport-safety warnings for a connection string (plan PLAN.md, two P1 findings).
 *
 * Neither of these blocks a connection. Both exist because the dangerous case is *silent*: no
 * adapter passes TLS configuration, so each driver's default applies (node-postgres
 * `sslmode=disable`, mysql2 no TLS, MongoDB no TLS outside `mongodb+srv`), and every query
 * parameter in a pasted URL is merged straight into driver options. A connection string copied
 * out of a wiki can put credentials on the wire in plaintext, or turn on `multipleStatements`,
 * and today nothing says so.
 *
 * Deliberately not auto-upgraded to TLS: `sslmode=require` fails outright against a server with
 * SSL switched off, and a connection that mysteriously stops working is worse than an informed
 * one that keeps working. The user decides; Qyre just stops being quiet about it.
 */

/** A single non-blocking advisory about how a connection will actually behave. */
export interface ConnectionWarning {
  /** Stable discriminator so a client can style or suppress a category without matching copy. */
  readonly kind: "insecure-transport" | "risky-parameter";
  readonly message: string;
}

/** Parameter spellings that enable TLS, per engine. Presence of any means the user has chosen. */
const TLS_ENABLING_PARAMS = new Map<string, (value: string) => boolean>([
  // Postgres: anything but an explicit `disable` is at least opportunistic TLS.
  ["sslmode", (value) => value.toLowerCase() !== "disable"],
  ["ssl", (value) => value.toLowerCase() !== "false" && value !== "0"],
  ["tls", (value) => value.toLowerCase() !== "false" && value !== "0"]
]);

/**
 * Parameters that weaken the client's security posture. The value predicate matters: `tls=true` is
 * the fix, `tlsInsecure=true` is the hazard, and both are "a tls-ish parameter".
 */
const RISKY_PARAMS = new Map<
  string,
  { readonly when: (value: string) => boolean; readonly why: string }
>([
  [
    "multiplestatements",
    {
      when: isTruthy,
      why: "lets one request run several statements, which widens what a single injected string can do"
    }
  ],
  [
    "insecureauth",
    { when: isTruthy, why: "allows the old MySQL password protocol, which is trivially sniffable" }
  ],
  [
    "tlsinsecure",
    {
      when: isTruthy,
      why: "disables certificate and hostname checks, so TLS no longer proves who you reached"
    }
  ],
  [
    "tlsallowinvalidcertificates",
    {
      when: isTruthy,
      why: "accepts any certificate, so an interception is indistinguishable from the real server"
    }
  ],
  [
    "tlsallowinvalidhostnames",
    { when: isTruthy, why: "accepts a certificate issued for a different host" }
  ],
  [
    "sslmode",
    {
      when: (value) => value.toLowerCase() === "disable",
      why: "turns TLS off explicitly, so credentials and rows travel in plaintext"
    }
  ],
  [
    "allowloadlocalinfile",
    { when: isTruthy, why: "lets the database server ask your machine for local files" }
  ]
]);

function isTruthy(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "";
}

/**
 * Hosts where plaintext is not a finding: the traffic never leaves the machine or the private
 * network the developer is already inside. Anything else - a public hostname or routable IP - is
 * treated as remote, because that is where "unencrypted" starts meaning "readable by strangers".
 */
function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  // A bare name with no dots is a container/service name on a private network (`postgres`, `db`).
  if (!host.includes(".") && !host.includes(":")) return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  if (a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * Inspect a connection string and report what a user would want to know before trusting it.
 * Returns an empty array for a SQLite path, an unparseable string, or a connection that is
 * already local and unremarkable.
 */
export function connectionWarnings(raw: string): ConnectionWarning[] {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return [];
  }
  // SQLite is a local file; there is no transport to secure.
  if (url.protocol === "file:") return [];

  const warnings: ConnectionWarning[] = [];
  const params = [...url.searchParams.entries()].map(
    ([key, value]) => [key.toLowerCase(), value] as const
  );

  // `mongodb+srv` always negotiates TLS, so it is never an insecure-transport case.
  const alwaysTls = url.protocol === "mongodb+srv:";
  const tlsRequested = params.some(
    ([key, value]) => TLS_ENABLING_PARAMS.get(key)?.(value) === true
  );
  if (!alwaysTls && !tlsRequested && url.hostname && !isLocalHost(url.hostname)) {
    warnings.push({
      kind: "insecure-transport",
      message:
        `${url.hostname} is not a local address and no TLS parameter was given, so credentials ` +
        "and query results travel unencrypted. Add sslmode=require (Postgres), ssl=true (MySQL), " +
        "or tls=true (MongoDB) if the server supports it."
    });
  }

  for (const [key, value] of params) {
    const risky = RISKY_PARAMS.get(key);
    if (risky?.when(value)) {
      warnings.push({ kind: "risky-parameter", message: `${key}=${value} ${risky.why}.` });
    }
  }

  return warnings;
}
