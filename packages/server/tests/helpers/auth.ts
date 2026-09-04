import type { FastifyInstance } from "fastify";

export function authHeaders(app: FastifyInstance): Record<string, string> {
  return { authorization: `Bearer ${app.authToken}` };
}
