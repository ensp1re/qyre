import type { DatabaseEngine } from "@qyre/core";

export type E2eProjectAccess = "writable" | "read-only" | "restricted";
export type E2eProjectTestScope = "all" | "role-matrix";

export interface E2eProjectConfig {
  readonly name: string;
  readonly engine: DatabaseEngine;
  readonly port: number;
  readonly access: E2eProjectAccess;
  readonly testScope: E2eProjectTestScope;
}

export const E2E_PROJECTS = [
  { name: "postgres", engine: "postgres", port: 4173, access: "writable", testScope: "all" },
  { name: "sqlite", engine: "sqlite", port: 4175, access: "writable", testScope: "all" },
  { name: "mysql", engine: "mysql", port: 4177, access: "writable", testScope: "all" },
  { name: "mongodb", engine: "mongodb", port: 4179, access: "writable", testScope: "all" },
  { name: "readonly", engine: "postgres", port: 4181, access: "read-only", testScope: "all" },
  {
    name: "postgres-restricted",
    engine: "postgres",
    port: 4183,
    access: "restricted",
    testScope: "role-matrix"
  },
  {
    name: "mysql-restricted",
    engine: "mysql",
    port: 4185,
    access: "restricted",
    testScope: "role-matrix"
  },
  {
    name: "sqlite-restricted",
    engine: "sqlite",
    port: 4187,
    access: "restricted",
    testScope: "role-matrix"
  },
  {
    name: "mongodb-readonly",
    engine: "mongodb",
    port: 4189,
    access: "read-only",
    testScope: "role-matrix"
  }
] as const satisfies readonly E2eProjectConfig[];

export function getE2eProjectConfig(projectName: string): E2eProjectConfig {
  const project = E2E_PROJECTS.find(({ name }) => name === projectName);
  if (!project) throw new Error(`Unknown Playwright fixture project: ${projectName}`);
  return project;
}
