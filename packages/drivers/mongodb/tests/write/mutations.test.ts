import { Binary, Decimal128, Double, Int32, Long, ObjectId, Timestamp } from "mongodb";
import { describe, expect, it } from "vitest";
import {
  deleteRowsByKey,
  getDocumentText,
  insertRow,
  updateFieldsByKey,
  updateRowByKey
} from "../../src/write/mutations.js";
import { fakeMongoClient, type FakeCall } from "../support/fake-client.js";

const ID = new ObjectId("507f1f77bcf86cd799439011");
const KEY = { _id: { $oid: ID.toHexString() } };

function callsTo(calls: FakeCall[], method: string): FakeCall[] {
  return calls.filter((call) => call.method === method);
}

async function setField(
  current: Record<string, unknown>,
  field: string,
  incoming: unknown,
  original: unknown
): Promise<{ set: Record<string, unknown>; calls: FakeCall[] }> {
  const { client, calls } = fakeMongoClient({
    findOne: async () => ({ _id: ID, ...current }),
    updateOne: async () => ({ matchedCount: 1 })
  });
  await updateFieldsByKey(
    client,
    "app",
    "items",
    KEY,
    { [field]: incoming },
    { [field]: original },
    []
  );
  const update = callsTo(calls, "updateOne")[0]?.args[1] as { $set: Record<string, unknown> };
  return { set: update.$set, calls };
}

async function rejectedField(
  current: Record<string, unknown>,
  field: string,
  incoming: unknown,
  original: unknown
): Promise<FakeCall[]> {
  const { client, calls } = fakeMongoClient({
    findOne: async () => ({ _id: ID, ...current }),
    updateOne: async () => ({ matchedCount: 1 })
  });
  await expect(
    updateFieldsByKey(client, "app", "items", KEY, { [field]: incoming }, { [field]: original }, [])
  ).rejects.toMatchObject({ statusCode: 400 });
  return calls;
}

describe("MongoDB grid field updates keep exact numeric BSON types", () => {
  it("reads the current document without promoting numeric wrappers", async () => {
    const { calls } = await setField({ n: new Int32(1) }, "n", "2", 1);
    expect(callsTo(calls, "findOne")[0]?.args[1]).toMatchObject({ promoteValues: false });
  });

  it.each(["1.5", "1e3", "99999999999999999999", 1.5])(
    "rejects %j for an Int64 field instead of truncating or wrapping it",
    async (incoming) => {
      const calls = await rejectedField({ n: Long.fromNumber(5) }, "n", incoming, 5);
      expect(callsTo(calls, "updateOne")).toHaveLength(0);
    }
  );

  it("stores Int64 edits exactly, including beyond 2^53", async () => {
    const { set } = await setField({ n: Long.fromNumber(5) }, "n", "9007199254740993", 5);
    expect(set.n).toBeInstanceOf(Long);
    expect(String(set.n)).toBe("9007199254740993");
    const { set: small } = await setField({ n: Long.fromNumber(5) }, "n", 6, 5);
    expect(small.n).toEqual(Long.fromNumber(6));
  });

  it("keeps Int32, Double, and Decimal128 fields in their BSON types", async () => {
    expect((await setField({ n: new Int32(1) }, "n", "7", 1)).set.n).toEqual(new Int32(7));
    const double = (await setField({ n: new Double(1.5) }, "n", "2", 1.5)).set.n;
    expect(double).toBeInstanceOf(Double);
    expect((double as Double).value).toBe(2);
    const decimal = (await setField({ n: Decimal128.fromString("0.1") }, "n", "0.30", "0.1")).set.n;
    expect(decimal).toBeInstanceOf(Decimal128);
    expect(String(decimal)).toBe("0.30");
  });

  it("widens an Int32 field only when the new value needs it", async () => {
    const wide = (await setField({ n: new Int32(1) }, "n", "3000000000", 1)).set.n;
    expect(wide).toEqual(Long.fromNumber(3_000_000_000));
    const fraction = (await setField({ n: new Int32(1) }, "n", "1.5", 1)).set.n;
    expect(fraction).toEqual(new Double(1.5));
    expect((await setField({ n: new Int32(1) }, "n", "1e3", 1)).set.n).toEqual(new Int32(1000));
  });

  it("keeps a Timestamp field a Timestamp even though BSON's Timestamp subclasses Long", async () => {
    const current = Timestamp.fromBits(1, 100);
    const { set } = await setField({ ts: current }, "ts", { t: 200, i: 2 }, { t: 100, i: 1 });
    expect(set.ts).toBeInstanceOf(Timestamp);
    expect((set.ts as Timestamp).getHighBits()).toBe(200);
    expect((set.ts as Timestamp).getLowBits()).toBe(2);
  });

  it("still lets a typed field be cleared to null", async () => {
    expect((await setField({ n: Long.fromNumber(5) }, "n", null, 5)).set.n).toBeNull();
    expect((await setField({ id: ID }, "id", null, ID.toHexString())).set.id).toBeNull();
  });

  it("rejects Decimal128 text that cannot be stored exactly", async () => {
    await rejectedField(
      { n: Decimal128.fromString("1") },
      "n",
      "1.2345678901234567890123456789012345678",
      "1"
    );
  });
});

describe("MongoDB grid date edits", () => {
  it("parses every validated offset form as an exact instant", async () => {
    const { set } = await setField(
      { at: new Date("2024-01-01T00:00:00Z") },
      "at",
      "2024-01-01T10:00:00+05",
      "2024-01-01T00:00:00.000Z"
    );
    expect((set.at as Date).toISOString()).toBe("2024-01-01T05:00:00.000Z");
  });

  it("rejects text that is not a date instead of storing the epoch", async () => {
    await rejectedField(
      { at: new Date("2024-01-01T00:00:00Z") },
      "at",
      "garbage",
      "2024-01-01T00:00:00.000Z"
    );
  });
});

describe("MongoDB appended array elements", () => {
  const first = new ObjectId("507f1f77bcf86cd799439012");
  const added = new ObjectId("507f1f77bcf86cd799439013");

  it("follows the single BSON type shared by existing siblings", async () => {
    const { set } = await setField(
      { refs: [first] },
      "refs",
      [first.toHexString(), added.toHexString()],
      [first.toHexString()]
    );
    expect(set.refs).toEqual([first, added]);

    const { set: events } = await setField(
      { events: [new Date("2024-01-01T00:00:00Z")] },
      "events",
      ["2024-01-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z"],
      ["2024-01-01T00:00:00.000Z"]
    );
    expect(events.events).toEqual([
      new Date("2024-01-01T00:00:00Z"),
      new Date("2024-02-01T00:00:00Z")
    ]);
  });

  it("keeps an appended value as JSON when siblings disagree or the value does not fit", async () => {
    const mixed = await setField(
      { refs: [first, "legacy"] },
      "refs",
      [first.toHexString(), "legacy", added.toHexString()],
      [first.toHexString(), "legacy"]
    );
    expect((mixed.set.refs as unknown[])[2]).toBe(added.toHexString());

    const unfit = await setField(
      { refs: [first] },
      "refs",
      [first.toHexString(), "not-an-id"],
      [first.toHexString()]
    );
    expect((unfit.set.refs as unknown[])[1]).toBe("not-an-id");
  });
});

describe("MongoDB nested structured edits", () => {
  it("stores shifted or retyped nested values as written instead of corrupting them", async () => {
    const { set } = await setField(
      { list: [new Int32(1), "a", new Date("2024-01-01T00:00:00Z")] },
      "list",
      ["a", "not a date"],
      [1, "a", "2024-01-01T00:00:00.000Z"]
    );
    expect(set.list).toEqual(["a", "not a date"]);
  });

  it("keeps nested Int64, Double, and binary values that were left unchanged", async () => {
    const bytes = new Binary(Buffer.from([1, 2]), 0x80);
    const { set } = await setField(
      { meta: { big: Long.fromString("9007199254740993"), ratio: new Double(1), bytes } },
      "meta",
      {
        big: "9007199254740993",
        ratio: 1,
        bytes: { type: "Buffer", data: [1, 2] },
        added: true
      },
      { big: "9007199254740993", ratio: 1, bytes: { type: "Buffer", data: [1, 2] } }
    );
    expect(set.meta).toEqual({
      big: Long.fromString("9007199254740993"),
      ratio: new Double(1),
      bytes,
      added: true
    });
  });
});

describe("MongoDB typed document keys", () => {
  it("targets string, numeric, 64-bit, and ObjectId _id values exactly", async () => {
    const { client, calls } = fakeMongoClient({ deleteMany: async () => ({ deletedCount: 4 }) });
    await deleteRowsByKey(client, "app", "items", [
      { _id: "507f1f77bcf86cd799439011" },
      { _id: 7 },
      { _id: { $numberLong: "9223372036854775807" } },
      { _id: { $oid: "507f1f77bcf86cd799439011" } },
      { _id: { $numberDecimal: "0.1" } }
    ]);
    const filter = callsTo(calls, "deleteMany")[0]?.args[0] as { _id: { $in: unknown[] } };
    expect(filter._id.$in).toEqual([
      "507f1f77bcf86cd799439011",
      7,
      Long.fromString("9223372036854775807"),
      ID,
      Decimal128.fromString("0.1")
    ]);
  });

  it.each([
    ["a malformed ObjectId", { $oid: "zz" }],
    ["a query operator", { $gt: "" }],
    ["null", null],
    ["an array", [ID.toHexString()]],
    ["an invalid Decimal128", { $numberDecimal: "abc" }]
  ])("rejects %s key with 400 before querying", async (_label, id) => {
    const { client, calls } = fakeMongoClient();
    await expect(getDocumentText(client, "app", "items", id)).rejects.toMatchObject({
      statusCode: 400
    });
    expect(calls).toHaveLength(0);
  });
});

describe("MongoDB whole-document editor", () => {
  const stored = {
    _id: ID,
    big: Long.fromString("9223372036854775807"),
    count: Long.fromNumber(5),
    ratio: new Double(1),
    n: new Int32(2)
  };

  it("shows values relaxed JSON would change in canonical form", async () => {
    const { client, calls } = fakeMongoClient({ findOne: async () => stored });
    const text = await getDocumentText(client, "app", "items", KEY._id);
    expect(JSON.parse(text!)).toEqual({
      _id: { $oid: ID.toHexString() },
      big: { $numberLong: "9223372036854775807" },
      count: { $numberLong: "5" },
      ratio: { $numberDouble: "1.0" },
      n: 2
    });
    expect(callsTo(calls, "findOne")[0]?.args).toEqual([
      { _id: ID },
      { promoteValues: false, bsonRegExp: true }
    ]);
  });

  it("saves untouched values with their original BSON types behind an atomic guard", async () => {
    const { client, calls } = fakeMongoClient({
      findOne: async () => stored,
      findOneAndReplace: async () => stored
    });
    const text = (await getDocumentText(client, "app", "items", KEY._id))!;
    const edited = { ...JSON.parse(text), label: "new" };
    const result = await updateRowByKey(client, "app", "items", KEY, edited, JSON.parse(text));
    expect(result).toEqual({ matched: 1 });

    const [filter, replacement] = callsTo(calls, "findOneAndReplace")[0]!.args as [
      Record<string, unknown>,
      Record<string, unknown>
    ];
    expect(filter).toEqual({ _id: ID, $expr: { $eq: ["$$ROOT", { $literal: stored }] } });
    expect(replacement).not.toHaveProperty("_id");
    expect(replacement.big).toEqual(Long.fromString("9223372036854775807"));
    expect(replacement.count).toEqual(Long.fromNumber(5));
    expect(replacement.ratio).toEqual(new Double(1));
    expect(replacement.n).toEqual(new Int32(2));
    expect(replacement.label).toBe("new");
  });

  it("reports stale when the document changed after it was loaded", async () => {
    const { client, calls } = fakeMongoClient({
      findOne: async () => ({ ...stored, n: new Int32(3) })
    });
    const expected = { _id: KEY._id, big: { $numberLong: "9223372036854775807" }, n: 2 };
    const result = await updateRowByKey(client, "app", "items", KEY, expected, expected);
    expect(result).toEqual({ matched: 0 });
    expect(callsTo(calls, "findOneAndReplace")).toHaveLength(0);
  });

  it("reports stale when the guarded replace matches nothing", async () => {
    const { client } = fakeMongoClient({
      findOne: async () => stored,
      findOneAndReplace: async () => null
    });
    const text = JSON.parse((await getDocumentText(client, "app", "items", KEY._id))!);
    expect(await updateRowByKey(client, "app", "items", KEY, text, text)).toEqual({ matched: 0 });
  });
});

describe("MongoDB inserts", () => {
  it("stores tagged 64-bit integers exactly", async () => {
    const { client, calls } = fakeMongoClient({ insertOne: async () => ({ insertedId: ID }) });
    const result = await insertRow(client, "app", "items", {
      big: { $numberLong: "9223372036854775807" },
      n: 5
    });
    const inserted = callsTo(calls, "insertOne")[0]?.args[0] as Record<string, unknown>;
    expect(inserted.big).toEqual(Long.fromString("9223372036854775807"));
    expect(result.row).toEqual({
      big: "9223372036854775807",
      n: 5,
      _id: ID.toHexString()
    });
  });
});
