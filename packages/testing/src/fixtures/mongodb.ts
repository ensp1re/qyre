import { MongoClient, ObjectId } from "mongodb";
import { FIXTURE } from "./definitions.js";

export async function setupMongoFixture(connectionString: string): Promise<void> {
  const databaseName = new URL(connectionString).pathname.slice(1) || "qyre_test";
  const client = new MongoClient(connectionString);
  try {
    await client.connect();
    const db = client.db(databaseName);
    const collection = db.collection(FIXTURE.table);
    const documents = [
      {
        _id: new ObjectId("000000000000000000000001"),
        name: "Ada Lovelace",
        email: "ada@example.com",
        profile: { account: { tags: ["admin", "beta"] } }
      },
      {
        _id: new ObjectId("000000000000000000000002"),
        name: "Alan Turing",
        email: "alan@example.com"
      },
      {
        _id: new ObjectId("000000000000000000000003"),
        name: "Grace Hopper",
        email: "grace@example.com"
      }
    ];
    await collection.bulkWrite(
      documents.map((document) => ({
        replaceOne: { filter: { _id: document._id }, replacement: document, upsert: true }
      }))
    );
    await collection.deleteMany({ _id: { $nin: documents.map((document) => document._id) } });
  } finally {
    await client.close();
  }
}
