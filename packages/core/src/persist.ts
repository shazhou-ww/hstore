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

type PersistOutcome = Readonly<{
  hash: Hash;
  writes: number;
}>;

export type PersistContext = Readonly<{
  adapter: StorageAdapter;
  hasher: Hasher;
}>;

const isJsonObject = (value: JsonValue): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

type PersistCache = Readonly<{
  primitives: Map<JsonPrimitive, Promise<PersistOutcome>>;
  arrays: WeakMap<JsonArray, Promise<PersistOutcome>>;
  objects: WeakMap<JsonObject, Promise<PersistOutcome>>;
}>;

const createCache = (): PersistCache =>
  ({
    primitives: new Map(),
    arrays: new WeakMap(),
    objects: new WeakMap()
  }) as const;

const toPrimitiveNode = (value: JsonPrimitive): PrimitiveNode => ({
  kind: "primitive",
  value
});

const toArrayNode = (elements: ReadonlyArray<Hash>): ArrayNode => ({
  kind: "array",
  elements
});

const toObjectNode = (entries: ReadonlyArray<{ key: string; hash: Hash }>): ObjectNode => ({
  kind: "object",
  entries
});

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

