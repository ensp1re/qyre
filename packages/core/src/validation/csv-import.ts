import { z } from "zod";

export const csvImportModeSchema = z.enum(["inspect", "validate", "import"]);

export const csvImportMappingSchema = z.record(z.string(), z.string().nullable());
