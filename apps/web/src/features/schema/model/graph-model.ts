import type { TableMetadata } from "@qyre/core";
import Dagre from "@dagrejs/dagre";
import type { Edge } from "@xyflow/react";
import type { RelationshipHighlight, TableFlowNode } from "./graph-types.js";

export type { RelationshipHighlight, TableFlowNode, TableNodeData } from "./graph-types.js";

export function tableNodeId(schema: string | undefined, name: string): string {
  return schema ? `${schema}.${name}` : name;
}

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
      const targetId = tableNodeId(reference.schema ?? table.schema, reference.table);
      if (!nodeIds.has(targetId)) continue;
      edges.push({
        id: `${sourceId}.${column.name}->${targetId}`,
        source: sourceId,
        target: targetId,
        sourceHandle: `col-${column.name}`,
        type: "smoothstep"
      });
    }
  }

  return { nodes, edges };
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

const NODE_WIDTH = 240;
const NODE_HEADER = 40;
const ROW_HEIGHT = 24;
const MAX_LAYOUT_ROWS = 12;

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
    return { ...node, position: { x: x - width / 2, y: y - height / 2 } };
  });
}
