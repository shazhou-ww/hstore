import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { z } from "zod";
import type { Hash, HashFn, StorageAdapter, StoredBlock } from "../index";
import { createHasher, createStore, deserializeNode, persistJsonValue } from "../index";
import type { PersistContext } from "../persist";
import type {
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue
} from "../types/json";

type AdapterHarness = Readonly<{
  adapter: StorageAdapter;
  dump: () => ReadonlyArray<StoredBlock>;
  size: () => number;
}>;

const sha256: HashFn = (input) =>
  createHash("sha256").update(input).digest("hex");

const createAdapterHarness = (): AdapterHarness => {
  const memory = new Map<string, StoredBlock>();

  const read: StorageAdapter["read"] = async (hash) => memory.get(hash);

  const write: StorageAdapter["write"] = async (record) => {
    memory.set(record.hash, record);
  };

  return {
    adapter: {
      read,
      write
    },
    dump: () => [...memory.values()],
    size: () => memory.size
  };
};

const createPersistContext = (adapter: StorageAdapter): PersistContext => ({
  adapter,
  hasher: createHasher(sha256),
  hints: {
    primitives: new Map<JsonPrimitive, Hash>(),
    arrays: new WeakMap<JsonArray, Hash>(),
    objects: new WeakMap<JsonObject, Hash>()
  }
});

describe("persistJsonValue", () => {
  test("persists primitives into a single node", async () => {
    const harness = createAdapterHarness();
    const context = createPersistContext(harness.adapter);
    const result = await persistJsonValue("hello", context);

    expect(result.writes).toBe(1);

    const [stored] = harness.dump();
    expect(deserializeNode(stored.bytes)).toEqual({
      kind: "primitive",
      value: "hello"
    });
  });

  test("reuses hashes for identical objects across calls", async () => {
    const harness = createAdapterHarness();
    const context = createPersistContext(harness.adapter);

    const first = await persistJsonValue(
      {
        foo: "bar",
        nested: { value: 42 }
      },
      context
    );

    const second = await persistJsonValue(
      {
        foo: "bar",
        nested: { value: 42 }
      },
      context
    );

    expect(first.hash).toBe(second.hash);
    expect(second.writes).toBe(0);
    expect(harness.size()).toBeGreaterThan(0);
  });
});

describe("createStore", () => {
  const schema = z
    .object({
      message: z.string(),
      data: z.array(z.number()),
      details: z.object({ nested: z.boolean() })
    })
    .strict();

  test("commit returns immutable versions and updates head", async () => {
    const harness = createAdapterHarness();
    const store = createStore({
      hashFn: sha256,
      adapter: harness.adapter,
      schema
    });

    const version = await store.commit({
      message: "hello",
      data: [1, 2, 3],
      details: { nested: true }
    });

    expect(version.previous).toBeNull();
    expect(typeof version.hash).toBe("string");
    expect(version.value).toEqual({
      message: "hello",
      data: [1, 2, 3],
      details: { nested: true }
    });
    expect(Object.isFrozen(version.value)).toBe(true);
    expect(Object.isFrozen(version.value.data)).toBe(true);
    expect(Object.isFrozen(version.value.details)).toBe(true);

    const head = await store.head();
    expect(head?.hash).toBe(version.hash);
    expect(head?.value).toBe(version.value);
  });

  test("creates a version chain and reuses cached nodes", async () => {
    const harness = createAdapterHarness();
    const store = createStore({
      hashFn: sha256,
      adapter: harness.adapter,
      schema
    });

    const first = await store.commit({
      message: "initial",
      data: [1, 2],
      details: { nested: true }
    });

    const secondPayload = {
      message: "initial",
      data: [...first.value.data, 3],
      details: { nested: false }
    };

    const second = await store.commit(secondPayload);

    expect(second.previous).toBe(first.hash);

    const fetchedFirst = await store.get(first.hash);
    expect(fetchedFirst?.value).toBe(first.value);

    const fetchedSecond = await store.get(second.hash);
    expect(fetchedSecond?.value).toBe(second.value);

    const fetchedAgain = await store.get(second.hash);
    expect(fetchedAgain?.value).toBe(second.value);
  });

  test("returns null when requesting an unknown version", async () => {
    const harness = createAdapterHarness();
    const store = createStore({
      hashFn: sha256,
      adapter: harness.adapter,
      schema
    });

    const result = await store.get("missing" as Hash);
    expect(result).toBeNull();
  });

  test("enforces schema validation on commit", async () => {
    const harness = createAdapterHarness();
    const store = createStore({
      hashFn: sha256,
      adapter: harness.adapter,
      schema
    });

    await expect(
      store.commit({
        message: "invalid",
        data: [1, 2],
        details: { nested: "nope" }
      } as unknown as z.infer<typeof schema>)
    ).rejects.toThrow();
  });
});

describe("createHasher", () => {
  test("hashValue matches stored state hash", async () => {
    const value: JsonValue = { payload: ["a", "b", "c"] };
    const hasher = createHasher(sha256);

    const hashFromValue = await hasher.hashValue(value);

    const harness = createAdapterHarness();
    const context: PersistContext = createPersistContext(harness.adapter);
    const persisted = await persistJsonValue(value, context);

    expect(hashFromValue).toBe(persisted.hash);
  });
});

