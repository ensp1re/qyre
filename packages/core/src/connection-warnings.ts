import type { ConnectionWarning } from "./types/connection/warnings.js";

export type { ConnectionWarning } from "./types/connection/warnings.js";

const TLS_ENABLING_PARAMS = new Map<string, (value: string) => boolean>([
  ["sslmode", (value) => value.toLowerCase() !== "disable"],
  ["ssl", (value) => value.toLowerCase() !== "false" && value !== "0"],
  ["tls", (value) => value.toLowerCase() !== "false" && value !== "0"]
]);

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

/** Treat loopback, private, and local hostnames as local. */
function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (!host.includes(".") && !host.includes(":")) return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  if (a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/** Report transport and parameter warnings for a target. */
export function connectionWarnings(raw: string): ConnectionWarning[] {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return [];
  }
  if (url.protocol === "file:") return [];

  const warnings: ConnectionWarning[] = [];
  const params = [...url.searchParams.entries()].map(
    ([key, value]) => [key.toLowerCase(), value] as const
  );

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
