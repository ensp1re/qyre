import {
  requireTestDatabaseUrl,
  requireTestMongoUrl,
  requireTestMysqlUrl,
  requireTestSqlitePath
} from "@qyre/testing";
import { setupFixture } from "@qyre/testing/postgres";
import { setupMongoFixture } from "@qyre/testing/mongodb";
import { setupMysqlFixture } from "@qyre/testing/mysql";
import { setupSqliteFixture } from "@qyre/testing/sqlite";
import { getE2eProjectConfig } from "./project-config.js";

export async function setupProjectFixture(projectName: string): Promise<void> {
  const project = getE2eProjectConfig(projectName);
  if (project.engine === "sqlite") {
    if (project.access !== "restricted") setupSqliteFixture(requireTestSqlitePath());
    return;
  }
  if (project.engine === "mongodb") {
    await setupMongoFixture(requireTestMongoUrl());
    return;
  }
  if (project.engine === "mysql") {
    await setupMysqlFixture(requireTestMysqlUrl());
    return;
  }
  await setupFixture(requireTestDatabaseUrl());
}

export function schemaForProject(projectName: string): string {
  const { engine } = getE2eProjectConfig(projectName);
  if (engine === "sqlite") return "main";
  if (engine === "mysql")
    return decodeURIComponent(new URL(requireTestMysqlUrl()).pathname.slice(1));
  if (engine === "mongodb") {
    return decodeURIComponent(new URL(requireTestMongoUrl()).pathname.slice(1));
  }
  return "public";
}
