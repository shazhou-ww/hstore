import type { Hash } from "./types/hash";
import type { JsonArray, JsonObject, JsonPrimitive, JsonValue } from "./types/json";
import { deserializeNode } from "./createHasher";
import type { HNode } from "./types/node";
import type { StorageAdapter } from "./types/adapter";
import type { FrozenJson } from "./types/store";
import type { PersistHashHints } from "./persist";

type FrozenValue = FrozenJson<JsonValue>;

type MaterializeCaches = Readonly<{
  values: Map<Hash, FrozenValue>;
  hints: PersistHashHints;
}>;

type MaterializeContext = Readonly<{
  adapter: StorageAdapter;
  caches: MaterializeCaches;
}>;

const freezeArray = (elements: ReadonlyArray<FrozenValue>): FrozenJson<JsonArray> =>
  Object.freeze(elements.slice()) as FrozenJson<JsonArray>;

const freezeObject = (
  entries: ReadonlyArray<readonly [string, FrozenValue]>
): FrozenJson<JsonObject> => {
  const result: Record<string, FrozenValue> = {};

  for (const [key, value] of entries) {
    result[key] = value;
  }

  return Object.freeze(result) as FrozenJson<JsonObject>;
};

const asPrimitive = (
  node: HNode,
  hash: Hash,
  caches: MaterializeCaches
): FrozenValue => {
  if (node.kind !== "primitive") {
    throw new Error("Expected primitive node");
  }

  caches.hints.primitives.set(node.value as JsonPrimitive, hash);
  caches.values.set(hash, node.value as FrozenValue);
  return node.value as FrozenValue;
};

const asArray = async (
  node: HNode,
  hash: Hash,
  context: MaterializeContext
): Promise<FrozenValue> => {
  if (node.kind !== "array") {
    throw new Error("Expected array node");
  }

  const children = await Promise.all(
    node.elements.map((childHash) => materializeHash(childHash, context))
  );

  const frozen = freezeArray(children);
  context.caches.hints.arrays.set(frozen, hash);
  context.caches.values.set(hash, frozen);
  return frozen;
};

const asObject = async (
  node: HNode,
  hash: Hash,
  context: MaterializeContext
): Promise<FrozenValue> => {
  if (node.kind !== "object") {
    throw new Error("Expected object node");
  }

  const pairs = await Promise.all(
    node.entries.map(async (entry) => {
      const value = await materializeHash(entry.hash, context);
      return [entry.key, value] as const;
    })
  );

  const frozen = freezeObject(pairs);
  context.caches.hints.objects.set(frozen, hash);
  context.caches.values.set(hash, frozen);
  return frozen;
};

const materializeHash = async (
  hash: Hash,
  context: MaterializeContext
): Promise<FrozenValue> => {
  const cached = context.caches.values.get(hash);

  if (cached) {
    return cached;
  }

  const record = await context.adapter.read(hash);

  if (!record) {
    throw new Error(`Missing node for hash "${hash}"`);
  }

  const node = deserializeNode(record.bytes);

  if (node.kind === "primitive") {
    return asPrimitive(node, hash, context.caches);
  }

  if (node.kind === "array") {
    return asArray(node, hash, context);
  }

  return asObject(node, hash, context);
};

export type ImmutableMaterializer = Readonly<{
  materialize(hash: Hash): Promise<FrozenValue>;
  caches: MaterializeCaches;
}>;

export const createImmutableMaterializer = (
  adapter: StorageAdapter
): ImmutableMaterializer => {
  const context: MaterializeContext = {
    adapter,
    caches: {
      values: new Map<Hash, FrozenValue>(),
      hints: {
        primitives: new Map<JsonPrimitive, Hash>(),
        arrays: new WeakMap<JsonArray, Hash>(),
        objects: new WeakMap<JsonObject, Hash>()
      }
    }
  };

  return {
    materialize: (hash: Hash) => materializeHash(hash, context),
    caches: context.caches
  };
};


