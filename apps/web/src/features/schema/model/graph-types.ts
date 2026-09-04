import type { TableMetadata } from "@qyre/core";
import type { Node } from "@xyflow/react";

export interface TableNodeData extends Record<string, unknown> {
  table: TableMetadata;
  highlighted?: boolean;
  dimmed?: boolean;
}

export type TableFlowNode = Node<TableNodeData, "table">;

export interface RelationshipHighlight {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

export interface GraphPosition {
  readonly x: number;
  readonly y: number;
}

export type SavedPositions = Record<string, GraphPosition>;
