export const SYSTEM_SCHEMAS = ["information_schema", "mysql", "performance_schema", "sys"];

/** Collision-safe key for schema/table lookup maps. */
export function tableKey(schema: string, table: string): string {
  return JSON.stringify([schema, table]);
}
