import type { TableMetadata } from "@qyre/core";
import { describe, expect, it } from "vitest";
import { buildGraph, layoutGraph, tableNodeId } from "./graph-model.js";

function col(
  name: string,
  overrides: Partial<TableMetadata["columns"][number]> = {}
): TableMetadata["columns"][number] {
  return {
    name,
    dataType: "integer",
    nullable: false,
    isPrimaryKey: false,
    isForeignKey: false,
    ...overrides
  };
}

const users: TableMetadata = {
  schema: "public",
  name: "users",
  columns: [col("id", { isPrimaryKey: true })],
  indexes: [],
  rowCount: 2
};

const posts: TableMetadata = {
  schema: "public",
  name: "posts",
  columns: [
    col("id", { isPrimaryKey: true }),
    col("author_id", {
      isForeignKey: true,
      references: { schema: "public", table: "users", column: "id" }
    })
  ],
  indexes: [],
  rowCount: 5
};

describe("buildGraph (F074)", () => {
  it("makes one node per table and one edge per resolvable foreign key", () => {
    const { nodes, edges } = buildGraph([users, posts]);
    expect(nodes.map((n) => n.id).sort()).toEqual(["public.posts", "public.users"]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "public.posts",
      target: "public.users",
      sourceHandle: "col-author_id"
    });
  });

  it("skips a foreign key whose target table isn't among the fetched tables", () => {
    // posts references users, but users isn't included here -> dangling edge skipped.
    const { nodes, edges } = buildGraph([posts]);
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
  });

  it("resolves a reference that omits its schema against the referencing table's schema", () => {
    const postsNoRefSchema: TableMetadata = {
      ...posts,
      columns: [
        col("id", { isPrimaryKey: true }),
        col("author_id", { isForeignKey: true, references: { table: "users", column: "id" } })
      ]
    };
    const { edges } = buildGraph([users, postsNoRefSchema]);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.target).toBe("public.users");
  });

  it("renders MongoDB-style tables (no references) as unconnected nodes", () => {
    const collections: TableMetadata[] = [
      { schema: "app", name: "users", columns: [col("_id", { isPrimaryKey: true })], indexes: [] },
      { schema: "app", name: "orders", columns: [col("_id", { isPrimaryKey: true })], indexes: [] }
    ];
    const { nodes, edges } = buildGraph(collections);
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(0);
  });

  it("schema-qualifies node ids so same-named tables in different schemas don't collide", () => {
    expect(tableNodeId("public", "users")).toBe("public.users");
    expect(tableNodeId(undefined, "users")).toBe("users");
  });
});

describe("layoutGraph (F074)", () => {
  it("assigns every node a finite, non-overlapping-origin position", () => {
    const { nodes, edges } = buildGraph([users, posts]);
    const laidOut = layoutGraph(nodes, edges);
    expect(laidOut).toHaveLength(2);
    for (const node of laidOut) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
    // Connected nodes land on different rows (dagre TB layout), not stacked at the origin.
    const [a, b] = laidOut;
    expect(a?.position.y).not.toBe(b?.position.y);
  });
});
