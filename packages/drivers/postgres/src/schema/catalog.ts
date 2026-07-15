export const SYSTEM_SCHEMAS = ["pg_catalog", "information_schema", "pg_toast"];

/** Collision-safe key for schema/table lookup maps. */
export function tableKey(schema: string, table: string): string {
  return JSON.stringify([schema, table]);
}
