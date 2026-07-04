import type { RowPage } from "@humbdb/core";

/** The result shape a single engine's query call is reduced to for {@link runInReadOnlyTransaction}. */
export interface ReadOnlyQueryResult {
  readonly columns: string[];
  readonly rows: Array<Record<string, unknown>>;
}

/**
 * The engine-specific operations {@link runInReadOnlyTransaction} needs, so the transaction
 * ceremony itself (begin, run, commit, rollback-and-rethrow-on-failure, always release) can be
 * shared while each engine still owns its own SQL dialect (`BEGIN TRANSACTION READ ONLY` vs.
 * `START TRANSACTION READ ONLY`) and client API shape (F049).
 */
export interface ReadOnlyTransactionClient {
  begin(): Promise<void>;
  query(sql: string): Promise<ReadOnlyQueryResult>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

/**
 * Runs `sql` inside a read-only transaction and always releases the client - `assertReadOnly` is
 * only a heuristic string check and can be bypassed (e.g. a writable CTE like
 * `WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x`); the database's own read-only
 * transaction mode is the authoritative guarantee, refusing any data-modifying statement
 * regardless of what the string check missed. Postgres and MySQL both duplicated this exact
 * begin/query/commit/catch-rollback/finally-release shape before this was extracted.
 */
export async function runInReadOnlyTransaction(
  client: ReadOnlyTransactionClient,
  sql: string
): Promise<RowPage> {
  try {
    await client.begin();
    const result = await client.query(sql);
    await client.commit();
    return {
      columns: result.columns,
      rows: result.rows,
      page: 0,
      pageSize: result.rows.length
    };
  } catch (error) {
    await client.rollback().catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
