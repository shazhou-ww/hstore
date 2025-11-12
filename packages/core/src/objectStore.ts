import type {
  FrozenJson,
  Hash,
  HashFn,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  StorageAdapter,
} from "./types";
import {
  deserializeHNode,
  freezeJson,
  HNode,
  isJsonPrimitive,
  serializeHNode,
  sortObjectEntries,
} from "./internal";

export type ObjectStore = Readonly<{
  read(hash: Hash): Promise<JsonValue | undefined>;
  write(value: JsonValue): Promise<Hash>;
}>;

export const createObjectStore = ({
  adapter,
  hashFn,
}: Readonly<{
  adapter: StorageAdapter;
  hashFn: HashFn;
}>): ObjectStore => {
  const hashToValue = new Map<Hash, FrozenJson<JsonValue>>();
  const primitiveHints = new Map<JsonPrimitive, Hash>();
  const objectHints = new WeakMap<object, Hash>();

  const remember = (hash: Hash, value: FrozenJson<JsonValue>) => {
    hashToValue.set(hash, value);
    if (isJsonPrimitive(value as JsonValue)) {
      primitiveHints.set(value as JsonPrimitive, hash);
    } else {
      objectHints.set(value as object, hash);
    }
  };

  const hintFor = (value: JsonValue): Hash | undefined =>
    isJsonPrimitive(value) ? primitiveHints.get(value) : objectHints.get(value as object);

  const materialize = async (node: HNode): Promise<FrozenJson<JsonValue> | undefined> => {
    const [tag, payload] = node;

    if (tag === 0) {
      return payload;
    }

    if (tag === 1) {
      const childHashes = payload as readonly Hash[];
      const values: JsonValue[] = [];
      for (const childHash of childHashes) {
        const childValue = await read(childHash);
        if (childValue === undefined) {
          return undefined;
        }
        values.push(childValue);
      }

      return freezeJson(values as JsonValue);
    }

    const entries = payload as readonly (readonly [string, Hash])[];
    const pairs: Array<readonly [string, JsonValue]> = [];
    for (const [key, childHash] of entries) {
      const childValue = await read(childHash);
      if (childValue === undefined) {
        return undefined;
      }
      pairs.push([key, childValue]);
    }

    return freezeJson(Object.fromEntries(pairs) as JsonObject);
  };

  const read = async (hash: Hash): Promise<JsonValue | undefined> => {
    const cached = hashToValue.get(hash);
    if (cached !== undefined) {
      return cached;
    }

    const block = await adapter.read(hash);
    if (!block) {
      return undefined;
    }

    const node = deserializeHNode(block.bytes);
    const value = await materialize(node);
    if (value === undefined) {
      return undefined;
    }

    remember(hash, value);
    return value;
  };

  const writeFrozen = async (value: JsonValue): Promise<Hash> => {
    const existing = hintFor(value);
    if (existing) {
      return existing;
    }

    let node: HNode;

    if (isJsonPrimitive(value)) {
      node = [0, value];
    } else if (Array.isArray(value)) {
      const childHashes = await Promise.all(value.map(writeFrozen));
      node = [1, childHashes];
    } else {
      const entries = sortObjectEntries(
        Object.entries(value as JsonObject) as Array<readonly [string, JsonValue]>
      );

      const hashedEntries: Array<readonly [string, Hash]> = [];
      for (const [key, childValue] of entries) {
        const childHash = await writeFrozen(childValue);
        hashedEntries.push([key, childHash]);
      }
      node = [2, hashedEntries];
    }

    const bytes = serializeHNode(node);
    const hash = await Promise.resolve(hashFn(bytes));
    if (!hashToValue.has(hash)) {
      await adapter.write({ hash, bytes });
    }
    remember(hash, value as FrozenJson<JsonValue>);
    return hash;
  };

  const write = async (value: JsonValue): Promise<Hash> => writeFrozen(freezeJson(value));

  return {
    read,
    write,
  };
};

