import {
  CSV_IMPORT_MAX_FIELD_BYTES,
  CSV_IMPORT_MAX_FILE_BYTES,
  csvImportMappingSchema,
  csvImportModeSchema
} from "@qyre/core";
import type { CsvImportMapping, CsvImportResponse } from "@qyre/core";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";
import { processCsvImport } from "../services/csv-import.js";
import { permissionRoute } from "../services/permission-denied.js";
import { requireAdapter } from "../services/require-adapter.js";

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export const CSV_IMPORT_MULTIPART_LIMITS = {
  fileSize: CSV_IMPORT_MAX_FILE_BYTES,
  files: 1,
  fields: 2,
  parts: 3,
  fieldSize: CSV_IMPORT_MAX_FIELD_BYTES
} as const;

export function registerCsvImportRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.post<{ Params: { schema: string; table: string } }>(
    "/api/tables/:schema/:table/import.csv",
    permissionRoute({ operation: "csv-import", target: "table", likelyMissingGrant: "INSERT" }),
    async (request, reply) => {
      if (!request.isMultipart()) throw badRequest("CSV import requires multipart/form-data.");

      let modeValue: string | undefined;
      let mappingValue: string | undefined;
      let response: CsvImportResponse | undefined;
      let fileSeen = false;

      for await (const part of request.parts({ limits: CSV_IMPORT_MULTIPART_LIMITS })) {
        if (part.type === "field") {
          if (fileSeen) throw badRequest("Multipart fields must appear before the CSV file.");
          if (part.valueTruncated)
            throw badRequest(`Multipart field "${part.fieldname}" is too large.`);
          if (part.fieldname === "mode") {
            if (modeValue !== undefined)
              throw badRequest('Multipart field "mode" may appear once.');
            modeValue = String(part.value);
          } else if (part.fieldname === "mapping") {
            if (mappingValue !== undefined) {
              throw badRequest('Multipart field "mapping" may appear once.');
            }
            mappingValue = String(part.value);
          } else {
            throw badRequest(`Unexpected multipart field "${part.fieldname}".`);
          }
          continue;
        }

        if (part.fieldname !== "file") throw badRequest('The file field must be named "file".');
        if (fileSeen) throw badRequest("Upload exactly one CSV file.");
        if (!modeValue) throw badRequest('Multipart field "mode" must appear before the file.');
        if (!part.filename.toLowerCase().endsWith(".csv")) {
          throw badRequest("The uploaded file must have a .csv extension.");
        }
        fileSeen = true;

        const parsedMode = csvImportModeSchema.safeParse(modeValue);
        if (!parsedMode.success) throw badRequest("mode must be inspect, validate, or import.");

        let mapping: CsvImportMapping | undefined;
        if (parsedMode.data !== "inspect") {
          if (!mappingValue) {
            throw badRequest('Multipart field "mapping" must appear before the file.');
          }
          let rawMapping: unknown;
          try {
            rawMapping = JSON.parse(mappingValue);
          } catch {
            throw badRequest("mapping must be valid JSON.");
          }
          const parsedMapping = csvImportMappingSchema.safeParse(rawMapping);
          if (!parsedMapping.success) {
            throw badRequest("mapping must map CSV headers to target columns or null.");
          }
          mapping = parsedMapping.data;
        }

        const startedAt = performance.now();
        response = await processCsvImport(
          requireAdapter(ctx.adapter),
          request.params.schema,
          request.params.table,
          parsedMode.data,
          mapping,
          part.file
        );
        if (part.file.truncated) {
          throw Object.assign(new Error("The CSV file exceeds the 10 MiB limit."), {
            statusCode: 413
          });
        }

        const durationMs = Math.round(performance.now() - startedAt);
        const insertedRows = response.mode === "inspect" ? 0 : response.insertedRows;
        const failedRows = response.mode === "inspect" ? 0 : response.failedRows;
        ctx.eventLog.log(
          failedRows > 0 ? "warn" : "info",
          `CSV ${response.mode} processed ${response.rowCount} row(s); ${insertedRows} inserted, ${failedRows} failed.`
        );
        request.log.info(
          {
            operation: "csv-import",
            mode: response.mode,
            schema: request.params.schema,
            table: request.params.table,
            rowCount: response.rowCount,
            insertedRows,
            failedRows,
            durationMs,
            outcome: failedRows > 0 ? "partial" : "success"
          },
          "csv import processed"
        );
      }

      if (!fileSeen || !response) throw badRequest("Upload exactly one CSV file.");
      return reply.send(response);
    }
  );
}
