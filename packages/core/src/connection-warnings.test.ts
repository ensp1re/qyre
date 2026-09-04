import { describe, expect, it } from "vitest";
import { connectionWarnings } from "./connection-warnings.js";

const kinds = (raw: string) => connectionWarnings(raw).map((warning) => warning.kind);

describe("connectionWarnings - insecure transport", () => {
  it("warns for a remote host with no TLS parameter", () => {
    const warnings = connectionWarnings("postgres://user:pass@db.example.com:5432/app");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.kind).toBe("insecure-transport");
    expect(warnings[0]?.message).toContain("db.example.com");
  });

  it("warns for a routable IP, which is the shape a pasted staging URL usually takes", () => {
    expect(kinds("postgres://user:pass@81.17.98.99:5437/app")).toEqual(["insecure-transport"]);
  });

  it.each([
    ["localhost", "postgres://user:pass@localhost:5432/app"],
    ["loopback IPv4", "postgres://user:pass@127.0.0.1:5432/app"],
    ["loopback IPv6", "postgres://user:pass@[::1]:5432/app"],
    ["private 10/8", "mysql://user:pass@10.1.2.3:3306/app"],
    ["private 192.168/16", "mysql://user:pass@192.168.1.10:3306/app"],
    ["private 172.16/12", "mysql://user:pass@172.20.0.5:3306/app"],
    ["a docker service name", "postgres://user:pass@postgres:5432/app"],
    ["an mDNS name", "postgres://user:pass@nas.local:5432/app"]
  ])("stays quiet for %s", (_label, raw) => {
    expect(connectionWarnings(raw)).toEqual([]);
  });

  it("172.32 is public, not part of the private 172.16/12 block", () => {
    expect(kinds("mysql://user:pass@172.32.0.5:3306/app")).toEqual(["insecure-transport"]);
  });

  it.each([
    ["Postgres", "postgres://user:pass@db.example.com/app?sslmode=require"],
    ["MySQL", "mysql://user:pass@db.example.com/app?ssl=true"],
    ["MongoDB", "mongodb://user:pass@db.example.com/app?tls=true"]
  ])("stays quiet once %s's own TLS parameter is set", (_engine, raw) => {
    expect(connectionWarnings(raw)).toEqual([]);
  });

  it("treats mongodb+srv as TLS, which it always negotiates", () => {
    expect(connectionWarnings("mongodb+srv://user:pass@cluster0.example.net/app")).toEqual([]);
  });

  it("ignores a SQLite file URL - there is no transport to secure", () => {
    expect(connectionWarnings("file:///tmp/app.db")).toEqual([]);
  });

  it("returns nothing for a bare SQLite path rather than throwing", () => {
    expect(connectionWarnings("./app.db")).toEqual([]);
  });
});

describe("connectionWarnings - risky parameters", () => {
  it.each([
    ["multipleStatements", "mysql://u:p@localhost/app?multipleStatements=true"],
    ["insecureAuth", "mysql://u:p@localhost/app?insecureAuth=true"],
    ["tlsInsecure", "mongodb://u:p@localhost/app?tlsInsecure=true"],
    ["tlsAllowInvalidCertificates", "mongodb://u:p@localhost/app?tlsAllowInvalidCertificates=true"],
    ["allowLoadLocalInfile", "mysql://u:p@localhost/app?allowLoadLocalInfile=true"]
  ])("flags %s even on a local host, since the risk is not about the network", (_name, raw) => {
    expect(kinds(raw)).toEqual(["risky-parameter"]);
  });

  it("flags an explicit sslmode=disable, and does not also claim TLS was requested", () => {
    expect(kinds("postgres://u:p@db.example.com/app?sslmode=disable")).toEqual([
      "insecure-transport",
      "risky-parameter"
    ]);
  });

  it("does not flag a parameter that is present but switched off", () => {
    expect(connectionWarnings("mysql://u:p@localhost/app?multipleStatements=false")).toEqual([]);
  });

  it("matches parameter names case-insensitively, as the drivers do", () => {
    expect(kinds("mysql://u:p@localhost/app?MULTIPLESTATEMENTS=true")).toEqual(["risky-parameter"]);
  });

  it("reports every risky parameter, not just the first", () => {
    expect(
      kinds("mysql://u:p@localhost/app?multipleStatements=true&insecureAuth=true")
    ).toHaveLength(2);
  });
});
