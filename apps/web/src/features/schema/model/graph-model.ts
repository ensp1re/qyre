import type { TableMetadata } from "@qyre/core";
import Dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

/** A table node's data payload - the whole `TableMetadata`, rendered by `TableNode`. */
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

export interface RelationshipSummary {
  componentCount: number;
  isolatedNodeCount: number;
  edgeCount: number;
}

/** A stable node id for a table. Schema-qualified so two tables with the same name in different
 * schemas (Postgres/MySQL) don't collide. */
export function tableNodeId(schema: string | undefined, name: string): string {
  return schema ? `${schema}.${name}` : name;
}

/**
 * Derives one React Flow node per table and one edge per resolvable foreign key (F074). Edges come
 * straight from each column's existing `references` metadata (present for SQL engines, absent for
 * MongoDB - which therefore renders as unconnected nodes), so no server change is needed. A
 * reference whose target table isn't among the fetched tables is skipped rather than drawn as a
 * dangling edge.
 */
export function buildGraph(tables: TableMetadata[]): { nodes: TableFlowNode[]; edges: Edge[] } {
  const nodeIds = new Set(tables.map((table) => tableNodeId(table.schema, table.name)));

  const nodes: TableFlowNode[] = tables.map((table) => ({
    id: tableNodeId(table.schema, table.name),
    type: "table",
    position: { x: 0, y: 0 },
    data: { table }
  }));

  const edges: Edge[] = [];
  for (const table of tables) {
    const sourceId = tableNodeId(table.schema, table.name);
    for (const column of table.columns) {
      const reference = column.references;
      if (!reference) continue;
      // A reference may omit its schema (same-schema FK); fall back to the referencing table's
      // schema so the target id matches how that table's own node id was built.
      const targetId = tableNodeId(reference.schema ?? table.schema, reference.table);
      if (!nodeIds.has(targetId)) continue;
      edges.push({
        id: `${sourceId}.${column.name}->${targetId}`,
        source: sourceId,
        target: targetId,
        // Anchor at the specific FK column's row handle (TableNode renders one per column); React
        // Flow falls back to the node's default handle if the id doesn't match.
        sourceHandle: `col-${column.name}`,
        type: "smoothstep"
      });
    }
  }

  return { nodes, edges };
}

function incidentEdgeIds(nodeId: string, edges: Edge[]): string[] {
  return edges
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .map((edge) => edge.id);
}

function relationshipHighlight(seedNodeIds: string[], edges: Edge[]): RelationshipHighlight {
  const nodeIds = new Set(seedNodeIds);
  const edgeIds = new Set<string>();
  const queue = [...seedNodeIds];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) continue;
    for (const edge of edges) {
      if (edge.source !== nodeId && edge.target !== nodeId) continue;
      edgeIds.add(edge.id);
      for (const nextNodeId of [edge.source, edge.target]) {
        if (nodeIds.has(nextNodeId)) continue;
        nodeIds.add(nextNodeId);
        queue.push(nextNodeId);
      }
    }
  }

  return { nodeIds, edgeIds };
}

export function relationshipHighlightForNode(nodeId: string, edges: Edge[]): RelationshipHighlight {
  return relationshipHighlight([nodeId], edges);
}

export function relationshipHighlightForEdge(edgeId: string, edges: Edge[]): RelationshipHighlight {
  const edge = edges.find((candidate) => candidate.id === edgeId);
  return edge
    ? relationshipHighlight([edge.source, edge.target], edges)
    : relationshipHighlight([], edges);
}

export function relationshipSummary(nodes: TableFlowNode[], edges: Edge[]): RelationshipSummary {
  const unvisited = new Set(nodes.map((node) => node.id));
  let componentCount = 0;

  for (const node of nodes) {
    if (!unvisited.has(node.id)) continue;
    componentCount += 1;
    const { nodeIds } = relationshipHighlightForNode(node.id, edges);
    for (const nodeId of nodeIds) unvisited.delete(nodeId);
  }

  return {
    componentCount,
    isolatedNodeCount: nodes.filter((node) => incidentEdgeIds(node.id, edges).length === 0).length,
    edgeCount: edges.length
  };
}

/** Approximate node dimensions dagre uses to space nodes before React Flow measures the real DOM.
 * Height scales with the (capped) column count so tall tables get proportionally more room. */
const NODE_WIDTH = 240;
const NODE_HEADER = 40;
const ROW_HEIGHT = 24;
const MAX_LAYOUT_ROWS = 12;

/**
 * Runs dagre's layered top-to-bottom layout, returning each node with a computed position (F074).
 * Pure - it clones positions onto fresh node objects rather than mutating, so callers can decide
 * whether to apply it (first render / "Reset layout") or use persisted positions instead.
 */
export function layoutGraph(nodes: TableFlowNode[], edges: Edge[]): TableFlowNode[] {
  const graph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 80 });

  for (const node of nodes) {
    const rows = Math.min(node.data.table.columns.length, MAX_LAYOUT_ROWS);
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEADER + rows * ROW_HEIGHT });
  }
  for (const edge of edges) graph.setEdge(edge.source, edge.target);

  Dagre.layout(graph);

  return nodes.map((node) => {
    const { x, y, width, height } = graph.node(node.id);
    // dagre positions by center; React Flow positions by top-left corner.
    return { ...node, position: { x: x - width / 2, y: y - height / 2 } };
  });
}
