import type {
  ColumnMetadata,
  DatabaseEngine,
  ForeignKeyReference,
  JsonExportMode,
  RowFilter,
  RowExportFormat,
  RowPage,
  RowSort,
  SortDirection,
  TableKind
} from "@qyre/core";

export interface RowsTablePendingInsert {
  readonly id: string;
  readonly values: Readonly<Record<string, unknown>>;
}

export interface RowsTablePendingChanges {
  getEdit: (rowKey: string, column: string) => { next: unknown } | undefined;
  stageEdit: (rowKey: string, column: string, original: unknown, next: unknown) => void;
  revertEdit: (rowKey: string, column: string) => void;
  inserts: readonly RowsTablePendingInsert[];
  addInsert: (initialValues?: Record<string, unknown>) => string;
  updateInsertValue: (id: string, column: string, value: unknown) => void;
  removeInsert: (id: string) => void;
  deletes: ReadonlySet<string>;
  stageDelete: (rowKey: string) => void;
  unstageDelete: (rowKey: string) => void;
}

export interface RowsTableProps {
  rowPage: RowPage;
  columns?: ColumnMetadata[];
  engine?: DatabaseEngine;
  tableName?: string;
  tableKind?: TableKind;
  approxRowCount?: number;
  matchingRowCount?: number;
  page: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onRefresh?: () => void;
  onNavigateToForeignKey?: (reference: ForeignKeyReference, value: unknown) => void;
  sortColumn?: string;
  sortDirection?: SortDirection;
  onSortChange?: (sort: RowSort | undefined) => void;
  exportFormats?: readonly RowExportFormat[];
  jsonExportMode?: JsonExportMode;
  onExportAllRows?: (format: RowExportFormat) => void;
  onExportSelectedRows?: (csv: string) => void;
  canImportCsv?: boolean;
  onImportCsv?: () => void;
  filters?: RowFilter[];
  onFiltersChange?: (filters: RowFilter[] | undefined) => void;
  tableSearch?: string;
  onTableSearchChange?: (search: string | undefined) => void;
  searchLoading?: boolean;
  editable?: boolean;
  editableColumns?: ReadonlySet<string>;
  editingDisabledReason?: string;
  primaryKeyColumns?: readonly string[];
  pendingChanges?: RowsTablePendingChanges;
  canInsert?: boolean;
  insertableColumns?: ReadonlySet<string>;
  canDelete?: boolean;
}
