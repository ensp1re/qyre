import type { TableMetadata } from "@qyre/core";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type NodeTypes
} from "@xyflow/react";
import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildGraph,
  layoutGraph,
  relationshipHighlightForEdge,
  relationshipHighlightForNode,
  type RelationshipHighlight,
  type TableFlowNode
} from "../../model/graph-model.js";
import { TableNode } from "./table-node.js";
import { useGraphPositions } from "../../model/use-graph-positions.js";

import "@xyflow/react/dist/style.css";

const NODE_TYPES: NodeTypes = { table: TableNode };

export interface SchemaGraphProps {
  tables: TableMetadata[];
  /** Stable per-database key (the connection target) so saved layouts don't leak between
   * databases. */
  databaseKey: string;
}

/** Applies saved positions where present, otherwise dagre auto-layout - so an existing arrangement
 * is restored and only genuinely-new tables get auto-placed. */
function positionedNodes(
  tables: TableMetadata[],
  saved: Record<string, { x: number; y: number }>
): TableFlowNode[] {
  const { nodes, edges } = buildGraph(tables);
  const laidOut = layoutGraph(nodes, edges);
  return laidOut.map((node) => {
    const savedPosition = saved[node.id];
    return savedPosition ? { ...node, position: savedPosition } : node;
  });
}

function SchemaGraphInner({ tables, databaseKey }: SchemaGraphProps): ReactNode {
  const { positions, savePositions, clearPositions } = useGraphPositions(databaseKey);
  const { fitView } = useReactFlow();
  const [highlight, setHighlight] = useState<RelationshipHighlight | null>(null);

  const edges = useMemo(() => buildGraph(tables).edges, [tables]);
  const [flowNodes, setNodes, onNodesChange] = useNodesState<TableFlowNode>([]);
  const [flowEdges, setEdges] = useEdgesState(edges);
  const visibleNodes = useMemo(
    () =>
      flowNodes.map((node) => {
        const isHighlighted = highlight?.nodeIds.has(node.id) ?? false;
        return {
          ...node,
          data: {
            ...node.data,
            highlighted: isHighlighted,
            dimmed: Boolean(highlight) && !isHighlighted
          }
        };
      }),
    [flowNodes, highlight]
  );
  const visibleEdges = useMemo(
    () =>
      flowEdges.map((edge) => {
        const isHighlighted = highlight?.edgeIds.has(edge.id) ?? false;
        const isDimmed = Boolean(highlight) && !isHighlighted;
        return {
          ...edge,
          selected: isHighlighted,
          animated: isHighlighted,
          style: {
            ...edge.style,
            // `--border` is a hairline-alpha rgba() token (see docs/references/design-system.md) -
            // wrapping it in rgb() as the previous code did produced invalid CSS
            // (`rgb(rgba(...))`), so the browser silently dropped the stroke declaration and edges
            // rendered with whatever default color React Flow falls back to. Use muted-foreground
            // at a visible-but-subdued alpha instead, consistent with the dimmed state below.
            stroke: isHighlighted
              ? "var(--c-blue)"
              : isDimmed
                ? "rgb(var(--muted-foreground) / 0.35)"
                : "rgb(var(--muted-foreground) / 0.6)",
            strokeWidth: isHighlighted ? 2 : 1
          }
        };
      }),
    [flowEdges, highlight]
  );

  // Rebuild nodes/edges whenever the table set changes (new database, refresh). Positions come from
  // localStorage when known, dagre otherwise. Keyed on databaseKey + table identity so switching
  // databases re-lays-out rather than stranding the previous database's arrangement.
  const signature = useMemo(
    () => tables.map((table) => `${table.schema}.${table.name}:${table.columns.length}`).join("|"),
    [tables]
  );
  const appliedRef = useRef<string>("");
  useEffect(() => {
    const key = `${databaseKey}::${signature}`;
    if (appliedRef.current === key) return;
    appliedRef.current = key;
    setHighlight(null);
    setNodes(positionedNodes(tables, positions));
    setEdges(edges);
  }, [databaseKey, signature, tables, positions, edges, setNodes, setEdges]);

  // Persist a node's position only when a *user* drag ends. Using onNodeDragStop (rather than
  // sniffing onNodesChange for dragging===false) keeps programmatic updates - setNodes on a reset
  // or database switch - from re-saving positions we just cleared or recomputed.
  const handleNodeDragStop = useCallback(
    (_event: unknown, node: TableFlowNode) => {
      savePositions({ [node.id]: node.position });
    },
    [savePositions]
  );

  const resetLayout = useCallback(() => {
    clearPositions();
    setHighlight(null);
    const { nodes, edges: builtEdges } = buildGraph(tables);
    setNodes(layoutGraph(nodes, builtEdges));
    setEdges(builtEdges);
    // Fit after the re-laid-out nodes commit.
    window.setTimeout(() => void fitView({ duration: 300, padding: 0.15 }), 0);
  }, [clearPositions, tables, setNodes, setEdges, fitView]);

  return (
    <div data-testid="schema-graph" className="h-full w-full">
      <ReactFlow
        nodes={visibleNodes}
        edges={visibleEdges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onNodeClick={(_event, node) =>
          setHighlight(relationshipHighlightForNode(node.id, flowEdges))
        }
        onEdgeClick={(_event, edge) =>
          setHighlight(relationshipHighlightForEdge(edge.id, flowEdges))
        }
        onPaneClick={() => setHighlight(null)}
        onNodeDragStop={handleNodeDragStop}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable
        className="bg-background"
      >
        <Background className="!bg-background" color="var(--border)" gap={20} />
        <Controls showInteractive={false} className="!border-border !bg-card" />
        <MiniMap
          pannable
          zoomable
          className="!border !border-border !bg-card"
          maskColor="rgb(var(--muted) / 0.4)"
          nodeColor="rgb(var(--muted) / 0.8)"
        />
        <button
          type="button"
          onClick={resetLayout}
          title="Reset the layout to auto-arrange"
          className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-[3px] border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" /> Reset layout
        </button>
      </ReactFlow>
    </div>
  );
}

/**
 * The Schema tab's interactive ERD (F074): every table a draggable pan/zoom node, every resolvable
 * foreign key an edge, with the layout persisted per database and a Reset-layout control. Wrapped
 * in `ReactFlowProvider` so `useReactFlow` (for `fitView`) works. See
 * docs/product-specs/schema-graph.md.
 */
export function SchemaGraph(props: SchemaGraphProps): ReactNode {
  return (
    <ReactFlowProvider>
      <SchemaGraphInner {...props} />
    </ReactFlowProvider>
  );
}
