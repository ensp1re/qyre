/** Metadata for a single column in a table. */
export interface ColumnMetadata {
  readonly name: string;
  readonly dataType: string;
  readonly nullable: boolean;
  readonly isPrimaryKey: boolean;
  readonly isForeignKey: boolean;
}

/** Metadata for a single index on a table. */
export interface IndexMetadata {
  readonly name: string;
  readonly columns: string[];
  readonly unique: boolean;
  readonly primary: boolean;
}

/** Metadata for a single table. */
export interface TableMetadata {
  readonly schema: string;
  readonly name: string;
  readonly columns: ColumnMetadata[];
  readonly indexes?: IndexMetadata[];
  readonly rowCount?: number;
}

/**
 * Every table's metadata across every schema in one response - backs the Schema tab (F027) so the
 * browser makes one request instead of fanning one out per table.
 */
export interface AllTablesResponse {
  readonly tables: TableMetadata[];
}
