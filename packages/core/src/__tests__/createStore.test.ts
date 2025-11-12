import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { z } from "zod";
import { TextDecoder, TextEncoder } from "util";

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
  seed: (block: StoredBlock) => void;
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
    seed: (block) => {
      memory.set(block.hash, block);
    },
  };
};

const schema = z
  .object({
    message: z.string(),
    data: z.array(z.number()),
    details: z.object({ nested: z.boolean() }),
  })
  .strict();

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const HEAD_KEY = "__hstore_head__" as Hash;

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

  test("initializes head record when adapter is empty", async () => {
    const harness = createAdapterHarness();
    expect(harness.writes()).toBe(0);

    await createStore({
      hashFn: sha256,
      adapter: harness.adapter,
      schema,
    });

    expect(harness.writes()).toBe(1);
    const headRecord = harness.dump().get(HEAD_KEY);
    expect(headRecord).toBeDefined();
    const parsed = JSON.parse(decoder.decode(headRecord!.bytes)) as {
      head?: unknown;
    };
    expect(parsed).toEqual({ head: null });
  });

  test("repairs a corrupted head record", async () => {
    const harness = createAdapterHarness();
    harness.seed({
      hash: HEAD_KEY,
      bytes: encoder.encode(JSON.stringify({ head: 42 })),
    });

    const before = harness.writes();
    await createStore({
      hashFn: sha256,
      adapter: harness.adapter,
      schema,
    });

    const headRecord = harness.dump().get(HEAD_KEY);
    expect(headRecord).toBeDefined();
    const parsed = JSON.parse(decoder.decode(headRecord!.bytes)) as {
      head?: unknown;
    };
    expect(parsed).toEqual({ head: null });
    expect(harness.writes()).toBe(before + 1);
  });

  test("returns null for malformed version blocks", async () => {
    const harness = createAdapterHarness();
    const store = await createStore({
      hashFn: sha256,
      adapter: harness.adapter,
      schema,
    });

    const malformedHash = "malformed" as Hash;
    harness.seed({
      hash: malformedHash,
      bytes: encoder.encode(JSON.stringify({ value: 1 })),
    });

    const result = await store.get(malformedHash);
    expect(result).toBeNull();
  });

  test("returns null when version references missing value node", async () => {
    const harness = createAdapterHarness();
    const store = await createStore({
      hashFn: sha256,
      adapter: harness.adapter,
      schema,
    });

    const versionHash = "dangling-version" as Hash;
    harness.seed({
      hash: versionHash,
      bytes: encoder.encode(
        JSON.stringify({
          value: "missing-value",
          previous: null,
          timestamp: Date.now(),
        })
      ),
    });

    const result = await store.get(versionHash);
    expect(result).toBeNull();
  });
});

