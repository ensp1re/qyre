import type { TableMetadata } from "@qyre/core";
import { describe, expect, it } from "vitest";
import {
  buildGraph,
  layoutGraph,
  relationshipHighlightForEdge,
  relationshipHighlightForNode,
  tableNodeId
} from "../../../../src/features/schema/model/graph-model.js";

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
  kind: "table",
  columns: [col("id", { isPrimaryKey: true })],
  indexes: [],
  rowCount: 2
};

const posts: TableMetadata = {
  schema: "public",
  name: "posts",
  kind: "table",
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
      {
        schema: "app",
        name: "users",
        kind: "collection",
        columns: [col("_id", { isPrimaryKey: true })],
        indexes: []
      },
      {
        schema: "app",
        name: "orders",
        kind: "collection",
        columns: [col("_id", { isPrimaryKey: true })],
        indexes: []
      }
    ];
    const { nodes, edges } = buildGraph(collections);
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(0);
    expect(collections.flatMap((table) => table.columns)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "_id", isPrimaryKey: true, isForeignKey: false })
      ])
    );
  });

  it("draws MySQL-style fixture foreign keys as schema-qualified table edges", () => {
    const mysqlUsers: TableMetadata = { ...users, schema: "qyre_test", name: "qyre_demo_users" };
    const mysqlOrders: TableMetadata = {
      schema: "qyre_test",
      name: "qyre_demo_orders",
      kind: "table",
      columns: [
        col("id", { isPrimaryKey: true }),
        col("user_id", {
          isForeignKey: true,
          references: { schema: "qyre_test", table: "qyre_demo_users", column: "id" }
        }),
        col("total", { dataType: "decimal" })
      ],
      indexes: [],
      rowCount: 2
    };

    const { edges } = buildGraph([mysqlUsers, mysqlOrders]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "qyre_test.qyre_demo_orders",
      target: "qyre_test.qyre_demo_users",
      sourceHandle: "col-user_id"
    });
  });

  it("schema-qualifies node ids so same-named tables in different schemas don't collide", () => {
    expect(tableNodeId("public", "users")).toBe("public.users");
    expect(tableNodeId(undefined, "users")).toBe("users");
  });
});

describe("relationship highlighting (F084)", () => {
  const comments: TableMetadata = {
    schema: "public",
    name: "comments",
    kind: "table",
    columns: [
      col("id", { isPrimaryKey: true }),
      col("post_id", {
        isForeignKey: true,
        references: { schema: "public", table: "posts", column: "id" }
      })
    ],
    indexes: [],
    rowCount: 9
  };

  const auditLog: TableMetadata = {
    schema: "public",
    name: "audit_log",
    kind: "table",
    columns: [col("id", { isPrimaryKey: true })],
    indexes: [],
    rowCount: 1
  };

  it("highlights the full connected relationship chain for a selected table", () => {
    const { edges } = buildGraph([users, posts, comments, auditLog]);
    const highlight = relationshipHighlightForNode("public.posts", edges);

    expect([...highlight.nodeIds].sort()).toEqual([
      "public.comments",
      "public.posts",
      "public.users"
    ]);
    expect([...highlight.edgeIds].sort()).toEqual([
      "public.comments.post_id->public.posts",
      "public.posts.author_id->public.users"
    ]);
  });

  it("highlights both ends of a selected relationship edge", () => {
    const { edges } = buildGraph([users, posts]);
    const highlight = relationshipHighlightForEdge("public.posts.author_id->public.users", edges);

    expect([...highlight.nodeIds].sort()).toEqual(["public.posts", "public.users"]);
    expect([...highlight.edgeIds]).toEqual(["public.posts.author_id->public.users"]);
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
    const [a, b] = laidOut;
    expect(a?.position.y).not.toBe(b?.position.y);
  });
});
