import type { RowPage } from "@qyre/core";

export interface ReadOnlyQueryResult {
  readonly columns: string[];
  readonly rows: Array<Record<string, unknown>>;
}

export interface ReadOnlyTransactionClient {
  begin(): Promise<void>;
  query(sql: string): Promise<ReadOnlyQueryResult>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

/** Run a query in an engine-enforced read-only transaction. */
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
