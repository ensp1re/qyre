export interface SchemaParams {
  schema: string;
}

export interface TableParams extends SchemaParams {
  table: string;
}

export interface TableDocumentParams extends TableParams {
  id: string;
}

export interface TableColumnParams extends TableParams {
  column: string;
}

export interface TableIndexParams extends TableParams {
  indexName: string;
}

export interface TableExportParams extends TableParams {
  format: string;
}

export interface DatabaseParams {
  database: string;
}

export interface OperationParams {
  id: string;
}

export type QueryParams = Record<string, string>;
