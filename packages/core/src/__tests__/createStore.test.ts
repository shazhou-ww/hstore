import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { z } from "zod";

import { createStore } from "../createStore";
import type {
  Hash,
  HashFn,
  StorageAdapter,
  StoredBlock,
} from "../types";

type AdapterHarness = Readonly<{
  adapter: StorageAdapter;
  dump: () => ReadonlyMap<Hash, StoredBlock>;
  writes: () => number;
}>;

const sha256: HashFn = (input) =>
  createHash("sha256").update(input).digest("hex");

const createAdapterHarness = (): AdapterHarness => {
  const memory = new Map<Hash, StoredBlock>();
  let writeCount = 0;

  const read: StorageAdapter["read"] = async (hash) => memory.get(hash);

  const write: StorageAdapter["write"] = async (record) => {
    memory.set(record.hash, record);
    writeCount += 1;
  };

  return {
    adapter: {
      read,
      write,
    },
    dump: () => new Map(memory),
    writes: () => writeCount,
  };
};

const schema = z
  .object({
    message: z.string(),
    data: z.array(z.number()),
    details: z.object({ nested: z.boolean() }),
  })
  .strict();

describe("createStore", () => {
  test("commit returns frozen versions and updates head", async () => {
    const harness = createAdapterHarness();
    const store = await createStore({
      hashFn: sha256,
      adapter: harness.adapter,
      schema,
    });

    const version = await store.commit({
      message: "hello",
      data: [1, 2, 3],
      details: { nested: true },
    });

    expect(version.previous).toBeNull();
    expect(typeof version.hash).toBe("string");
    expect(version.value).toEqual({
      message: "hello",
      data: [1, 2, 3],
      details: { nested: true },
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
    const store = await createStore({
      hashFn: sha256,
      adapter: harness.adapter,
      schema,
    });

    const first = await store.commit({
      message: "initial",
      data: [1, 2],
      details: { nested: true },
    });

    const secondPayload = {
      message: "initial",
      data: [...first.value.data, 3],
      details: { nested: false },
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
    const store = await createStore({
      hashFn: sha256,
      adapter: harness.adapter,
      schema,
    });

    const result = await store.get("missing" as Hash);
    expect(result).toBeNull();
  });

  test("enforces schema validation on commit", async () => {
    const harness = createAdapterHarness();
    const store = await createStore({
      hashFn: sha256,
      adapter: harness.adapter,
      schema,
    });

    await expect(
      store.commit({
        message: "invalid",
        data: [1, 2],
        details: { nested: "nope" },
      } as unknown as z.infer<typeof schema>)
    ).rejects.toThrow();
  });

  test("stores head pointer alongside persisted versions", async () => {
    const harness = createAdapterHarness();
    const store = await createStore({
      hashFn: sha256,
      adapter: harness.adapter,
      schema,
    });

    await store.commit({
      message: "persist",
      data: [],
      details: { nested: true },
    });

    const blocks = harness.dump();
    expect(blocks.size).toBeGreaterThan(0);
    expect(blocks.has("__hstore_head__")).toBe(true);
  });
});

