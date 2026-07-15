/** Databases/collections MongoDB itself manages, never shown to or granted-checked for the user. */
export const SYSTEM_DATABASES = new Set(["admin", "local", "config"]);

export function isSystemCollection(name: string): boolean {
  return name.startsWith("system.");
}

export function tableKey(schema: string, table: string): string {
  return JSON.stringify([schema, table]);
}
