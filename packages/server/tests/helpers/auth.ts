import type { FastifyInstance } from "fastify";

/** Authorization header for the given app's session token (F122) - every `/api/*` request in
 * tests needs this now that the auth guard rejects tokenless requests. */
export function authHeaders(app: FastifyInstance): Record<string, string> {
  return { authorization: `Bearer ${app.authToken}` };
}
