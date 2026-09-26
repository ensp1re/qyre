import type { MongoClient } from "mongodb";

export interface FakeCall {
  readonly method: string;
  readonly args: unknown[];
}

type Handler = (...args: unknown[]) => unknown;

/** A MongoClient stand-in that records collection calls and answers from per-method handlers. */
export function fakeMongoClient(handlers: Record<string, Handler> = {}): {
  client: MongoClient;
  calls: FakeCall[];
} {
  const calls: FakeCall[] = [];
  const record =
    (method: string, fallback: Handler = () => undefined) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return (handlers[method] ?? fallback)(...args);
    };

  interface FakeCursor extends AsyncIterable<unknown> {
    sort: (...args: unknown[]) => FakeCursor;
    skip: (...args: unknown[]) => FakeCursor;
    limit: (...args: unknown[]) => FakeCursor;
    toArray: () => Promise<unknown[]>;
    close: () => Promise<void>;
  }

  const cursor = (documents: unknown[]): FakeCursor => {
    const chain: FakeCursor = {
      sort: record("sort", () => chain) as FakeCursor["sort"],
      skip: record("skip", () => chain) as FakeCursor["skip"],
      limit: record("limit", () => chain) as FakeCursor["limit"],
      toArray: async () => documents,
      close: async () => {},
      async *[Symbol.asyncIterator]() {
        yield* documents;
      }
    };
    return chain;
  };

  const collection = {
    find: (...args: unknown[]) => {
      calls.push({ method: "find", args });
      return cursor((handlers.find?.(...args) as unknown[] | undefined) ?? []);
    },
    aggregate: (...args: unknown[]) => {
      calls.push({ method: "aggregate", args });
      return cursor((handlers.aggregate?.(...args) as unknown[] | undefined) ?? []);
    },
    countDocuments: record("countDocuments", async () => 0),
    estimatedDocumentCount: record("estimatedDocumentCount", async () => 0),
    indexes: record("indexes", async () => []),
    findOne: record("findOne", async () => null),
    findOneAndReplace: record("findOneAndReplace", async () => null),
    updateOne: record("updateOne", async () => ({ matchedCount: 0 })),
    deleteMany: record("deleteMany", async () => ({ deletedCount: 0 })),
    insertOne: record("insertOne", async () => ({ insertedId: undefined }))
  };

  const db = {
    collection: () => collection,
    listCollections: () => cursor([{ name: "items", type: "collection" }])
  };

  return { client: { db: () => db } as unknown as MongoClient, calls };
}
