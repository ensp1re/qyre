import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../../app.js";
import { registerColumnDdlRoutes } from "./schema-ddl/column-routes.js";
import { registerIndexDdlRoutes } from "./schema-ddl/index-routes.js";
import { registerTableDdlRoutes } from "./schema-ddl/table-routes.js";

/** Registers the table, column, and index DDL route groups. */
export function registerSchemaDdlRoutes(app: FastifyInstance, ctx: ServerContext): void {
  registerTableDdlRoutes(app, ctx);
  registerColumnDdlRoutes(app, ctx);
  registerIndexDdlRoutes(app, ctx);
}
