import type {
  CsvImportInspection,
  CsvImportMapping,
  CsvImportMode,
  CsvImportResponse,
  CsvImportResult
} from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

async function requestCsvImport(
  schema: string,
  table: string,
  file: File,
  mode: CsvImportMode,
  mapping?: CsvImportMapping
): Promise<CsvImportResponse> {
  const body = new FormData();
  body.append("mode", mode);
  if (mapping) body.append("mapping", JSON.stringify(mapping));
  body.append("file", file);
  return fetchJson<CsvImportResponse>(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/import.csv`,
    { method: "POST", body }
  );
}

export async function inspectCsvImport(
  schema: string,
  table: string,
  file: File
): Promise<CsvImportInspection> {
  const response = await requestCsvImport(schema, table, file, "inspect");
  if (response.mode !== "inspect") throw new Error("Unexpected CSV inspection response.");
  return response;
}

export async function validateCsvImport(
  schema: string,
  table: string,
  file: File,
  mapping: CsvImportMapping
): Promise<CsvImportResult> {
  const response = await requestCsvImport(schema, table, file, "validate", mapping);
  if (response.mode !== "validate") throw new Error("Unexpected CSV validation response.");
  return response;
}

export async function importCsv(
  schema: string,
  table: string,
  file: File,
  mapping: CsvImportMapping
): Promise<CsvImportResult> {
  const response = await requestCsvImport(schema, table, file, "import", mapping);
  if (response.mode !== "import") throw new Error("Unexpected CSV import response.");
  return response;
}
