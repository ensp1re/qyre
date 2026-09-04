import type { TablePermissions } from "@qyre/core";

export const EMPTY_TABLE_PERMISSIONS: Readonly<TablePermissions> = Object.freeze({
  select: false,
  insert: false,
  update: false,
  delete: false
});

export const READ_ONLY_TABLE_PERMISSIONS: Readonly<TablePermissions> = Object.freeze({
  select: true,
  insert: false,
  update: false,
  delete: false
});
