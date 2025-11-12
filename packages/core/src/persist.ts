import type { Hash } from "./types/hash";
import type { Hasher } from "./types/hasher";
import type { JsonArray, JsonObject, JsonPrimitive, JsonValue } from "./types/json";
import type {
  ArrayNode,
  HNode,
  ObjectNode,
  PrimitiveNode
} from "./types/node";
import type { StorageAdapter } from "./types/adapter";
import type { PersistResult } from "./types/store";

/**
 * Internal result of persisting a node, containing its hash and number of writes performed.
 */
type PersistOutcome = Readonly<{
  hash: Hash;
  writes: number;
}>;

/**
 * Shared dependencies required to persist nodes into storage.
 */
export type PersistContext = Readonly<{
  adapter: StorageAdapter;
  hasher: Hasher;
}>;

/**
 * Type guard determining whether a JSON value is a non-null object.
 */
const isJsonObject = (value: JsonValue): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Per-persistence caching layer to deduplicate work across repeated structures.
 */
type PersistCache = Readonly<{
  primitives: Map<JsonPrimitive, Promise<PersistOutcome>>;
  arrays: WeakMap<JsonArray, Promise<PersistOutcome>>;
  objects: WeakMap<JsonObject, Promise<PersistOutcome>>;
}>;

/**
 * Creates a new cache for tracking persisted values during a single operation.
 */
const createCache = (): PersistCache =>
  ({
    primitives: new Map(),
    arrays: new WeakMap(),
    objects: new WeakMap()
  }) as const;

/**
 * Converts a JSON primitive into a primitive node.
 */
const toPrimitiveNode = (value: JsonPrimitive): PrimitiveNode => ({
  kind: "primitive",
  value
});

/**
 * Converts element hashes into an array node.
 */
const toArrayNode = (elements: ReadonlyArray<Hash>): ArrayNode => ({
  kind: "array",
  elements
});

/**
 * Converts key/hash pairs into an object node.
 */
const toObjectNode = (entries: ReadonlyArray<{ key: string; hash: Hash }>): ObjectNode => ({
  kind: "object",
  entries
});

/**
 * Persists a primitive JSON value, leveraging cache hits when possible.
 */
const persistPrimitive = (
  value: JsonPrimitive,
  cache: PersistCache,
  context: PersistContext
): Promise<PersistOutcome> => {
  const cached = cache.primitives.get(value);

  if (cached) {
    return cached.then((outcome) => ({
      hash: outcome.hash,
      writes: 0
    }));
  }

  const outcome = persistNode(toPrimitiveNode(value), context);
  cache.primitives.set(value, outcome);
  return outcome;
};

/**
 * Persists an array JSON value, leveraging cache hits when possible.
 */
const persistArray = (
  values: JsonArray,
  cache: PersistCache,
  context: PersistContext
): Promise<PersistOutcome> => {
  const cached = cache.arrays.get(values);

  if (cached) {
    return cached.then((outcome) => ({
      hash: outcome.hash,
      writes: 0
    }));
  }

  const outcome = persistCompositeArray(values, cache, context);
  cache.arrays.set(values, outcome);
  return outcome;
};

/**
 * Persists an array by recursively persisting elements before storing the composed node.
 */
const persistCompositeArray = async (
  values: JsonArray,
  cache: PersistCache,
  context: PersistContext
): Promise<PersistOutcome> => {
  const children = await Promise.all(values.map((item) => persistValue(item, cache, context)));
  const node = toArrayNode(children.map((child) => child.hash));
  const current = await persistNode(node, context);
  const writes = children.reduce((sum, child) => sum + child.writes, 0) + current.writes;

  return {
    hash: current.hash,
    writes
  };
};

/**
 * Persists a JSON object, leveraging cache hits when possible.
 */
const persistObject = (
  value: JsonObject,
  cache: PersistCache,
  context: PersistContext
): Promise<PersistOutcome> => {
  const cached = cache.objects.get(value);

  if (cached) {
    return cached.then((outcome) => ({
      hash: outcome.hash,
      writes: 0
    }));
  }

  const outcome = persistCompositeObject(value, cache, context);
  cache.objects.set(value, outcome);
  return outcome;
};

/**
 * Persists a JSON object by recursively persisting property values before storing the composed node.
 */
const persistCompositeObject = async (
  value: JsonObject,
  cache: PersistCache,
  context: PersistContext
): Promise<PersistOutcome> => {
  const keys = Object.keys(value).sort((left, right) => left.localeCompare(right));
  const children = await Promise.all(
    keys.map(async (key) => ({
      key,
      child: await persistValue(value[key], cache, context)
    }))
  );

  const node = toObjectNode(children.map(({ key, child }) => ({ key, hash: child.hash })));
  const current = await persistNode(node, context);
  const writes =
    children.reduce((sum, { child }) => sum + child.writes, 0) + current.writes;

  return {
    hash: current.hash,
    writes
  };
};

/**
 * Persists an arbitrary JSON value by dispatching to the appropriate strategy.
 */
const persistValue = (
  value: JsonValue,
  cache: PersistCache,
  context: PersistContext
): Promise<PersistOutcome> => {
  if (value === null) {
    return persistPrimitive(value, cache, context);
  }

  if (typeof value !== "object") {
    return persistPrimitive(value, cache, context);
  }

  if (Array.isArray(value)) {
    return persistArray(value, cache, context);
  }

  if (!isJsonObject(value)) {
    throw new TypeError("Expected JsonObject");
  }

  return persistObject(value, cache, context);
};

/**
 * Stores a node into the adapter, avoiding duplicate writes when the hash already exists.
 */
export const persistNode = async (
  node: HNode,
  context: PersistContext
): Promise<PersistOutcome> => {
  const hash = await context.hasher.hashNode(node);
  const existing = await context.adapter.read(hash);

  if (existing) {
    return { hash, writes: 0 };
  }

  await context.adapter.write({ hash, node });
  return { hash, writes: 1 };
};

/**
 * Persists a JSON value and reports the resulting root hash and number of nodes written.
 */
export const persistJsonValue = async (
  value: JsonValue,
  context: PersistContext
): Promise<PersistResult> => {
  const cache = createCache();
  const outcome = await persistValue(value, cache, context);

  return {
    rootHash: outcome.hash,
    nodesWritten: outcome.writes
  };
};

