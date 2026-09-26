import { BSON, Code, Double, Long } from "mongodb";

// The driver's own BSON copy keeps instanceof checks valid for values it decodes.
const { EJSON } = BSON;

/** Read options that keep every numeric BSON type and regex option observable. */
export const EXACT_DOCUMENT_READ = { promoteValues: false, bsonRegExp: true } as const;

function invalidDocument(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function isPlainDocument(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !("_bsontype" in value) &&
    !(value instanceof Date) &&
    !(value instanceof RegExp) &&
    !(value instanceof Uint8Array)
  );
}

/**
 * Tag values relaxed Extended JSON would rewrite as a different BSON type: every Int64, and
 * integral Doubles that would otherwise read back as Int32.
 */
function lossless(value: unknown): unknown {
  if (value instanceof Long) return EJSON.serialize(value, { relaxed: false });
  if (value instanceof Double) {
    return Number.isInteger(value.value) ? EJSON.serialize(value, { relaxed: false }) : value;
  }
  if (value instanceof Code && value.scope) {
    return new Code(value.code, lossless(value.scope) as Record<string, unknown>);
  }
  if (Array.isArray(value)) return value.map(lossless);
  if (isPlainDocument(value)) {
    const document: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      Object.defineProperty(document, key, {
        value: lossless(nested),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
    return document;
  }
  return value;
}

/**
 * Serialize a document read with {@link EXACT_DOCUMENT_READ} as readable relaxed Extended JSON
 * that {@link parseDocumentJson} turns back into the same BSON types.
 */
export function documentText(document: Record<string, unknown>): string {
  return EJSON.stringify(lossless(document), { relaxed: true });
}

/** Deserialize editor JSON with canonical number semantics so tagged types survive exactly. */
export function parseDocumentJson(value: Record<string, unknown>): Record<string, unknown> {
  try {
    return EJSON.deserialize(value, { relaxed: false }) as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid value";
    throw invalidDocument(`Invalid Extended JSON: ${detail}`);
  }
}
