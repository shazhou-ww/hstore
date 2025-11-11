import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import type { HashFn, StorageAdapter, StoredNode } from "../index";
import { createHasher, createStore, persistJsonValue } from "../index";
import type { JsonValue } from "../types/json";

type AdapterHarness = Readonly<{
  adapter: StorageAdapter;
  dump: () => ReadonlyArray<StoredNode>;
  size: () => number;
}>;

const sha256: HashFn = (input) =>
  createHash("sha256").update(input).digest("hex");

const createAdapterHarness = (): AdapterHarness => {
  const memory = new Map<string, StoredNode>();

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

describe("persistJsonValue", () => {
  test("persists primitives into a single node", async () => {
    const harness = createAdapterHarness();
    const result = await persistJsonValue("hello", {
      adapter: harness.adapter,
      hasher: createHasher(sha256)
    });

    expect(result.nodesWritten).toBe(1);

    const [stored] = harness.dump();
    expect(stored.node).toEqual({
      kind: "primitive",
      value: "hello"
    });
  });

  test("reuses hashes for identical objects across calls", async () => {
    const harness = createAdapterHarness();
    const context = {
      adapter: harness.adapter,
      hasher: createHasher(sha256)
    };

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

    expect(first.rootHash).toBe(second.rootHash);
    expect(second.nodesWritten).toBe(0);
    expect(harness.size()).toBeGreaterThan(0);
  });
});

describe("createStore.persist", () => {
  test("deduplicates repeated array elements within one persist call", async () => {
    const harness = createAdapterHarness();
    const store = createStore({ hashFn: sha256, adapter: harness.adapter });

    const payload = {
      greetings: ["hi", "hi", "hi"]
    };

    const result = await store.persist(payload);
    expect(result.nodesWritten).toBe(3);

    const nodes = harness.dump();
    const primitiveNodes = nodes.filter(
      (node) => node.node.kind === "primitive"
    );
    expect(primitiveNodes.length).toBe(1);
  });
});

describe("materialize", () => {
  test("restores the original JSON value", async () => {
    const harness = createAdapterHarness();
    const store = createStore({ hashFn: sha256, adapter: harness.adapter });
    const value = {
      message: "hello",
      data: [1, 2, 3],
      details: { nested: true }
    };

    const { rootHash } = await store.persist(value);
    const restored = await store.materialize(rootHash);

    expect(restored.value).toEqual(value);
    expect(restored.visited).toBeGreaterThan(0);
  });

  test("limits traversal depth when requested", async () => {
    const harness = createAdapterHarness();
    const store = createStore({ hashFn: sha256, adapter: harness.adapter });
    const { rootHash } = await store.persist({
      level1: {
        level2: {
          answer: 42
        }
      }
    });

    const shallow = await store.materialize(rootHash, { limitDepth: 1 });
    const level1 = shallow.value as Record<string, any>;
    expect(typeof level1.level1).toBe("object");
    expect(typeof level1.level1.level2).toBe("string");
  });
});

describe("createHasher", () => {
  test("hashValue matches stored root hash", async () => {
    const value: JsonValue = { payload: ["a", "b", "c"] };
    const hasher = createHasher(sha256);

    const hashFromValue = await hasher.hashValue(value);

    const harness = createAdapterHarness();
    const store = createStore({ hashFn: sha256, adapter: harness.adapter });
    const persisted = await store.persist(value);

    expect(hashFromValue).toBe(persisted.rootHash);
  });
});

