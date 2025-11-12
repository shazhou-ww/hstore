import { describe, expect, test } from "bun:test";

import { createMemoryAdapter } from "@hstore/memory-adapter";
import type { StorageAdapter, StoredBlock } from "@hstore/core";

import { createCascadeAdapter } from "../cascadeAdapter";

const block = (hash: string, seed = 0): StoredBlock => ({
  hash,
  bytes: new Uint8Array([seed, seed + 1, seed + 2]),
});

const createLayeredAdapters = (count: number): StorageAdapter[] =>
  Array.from({ length: count }, () => createMemoryAdapter());

describe("createCascadeAdapter", () => {
  test("writes through all adapters", async () => {
    const layers = createLayeredAdapters(3);
    const cascade = createCascadeAdapter({ adapters: layers });

    const sample = block("alpha", 5);
    await cascade.write(sample);

    for (const adapter of layers) {
      const stored = await adapter.read("alpha");
      expect(stored).toEqual(sample);
      expect(stored).not.toBe(sample);
    }
  });

  test("hydrates lower cache into higher priority adapters", async () => {
    const [l1, l2] = createLayeredAdapters(2);
    const cascade = createCascadeAdapter({ adapters: [l1, l2] });

    const sample = block("beta", 9);
    await l2.write(sample);

    const fetched = await cascade.read("beta");
    expect(fetched).toEqual(sample);

    const populated = await l1.read("beta");
    expect(populated).toEqual(sample);
  });

  test("returns undefined when no adapter contains the block", async () => {
    const cascade = createCascadeAdapter({
      adapters: createLayeredAdapters(2),
    });

    const result = await cascade.read("missing");
    expect(result).toBeUndefined();
  });

  test("supports single adapter configuration", async () => {
    const memory = createMemoryAdapter();
    const cascade = createCascadeAdapter({ adapters: [memory] });

    const sample = block("solo", 3);
    await cascade.write(sample);

    const read = await cascade.read("solo");
    expect(read).toEqual(sample);
  });

  test("throws when constructed without adapters", () => {
    expect(() =>
      createCascadeAdapter({ adapters: [] })
    ).toThrowErrorMatchingInlineSnapshot(
      "\"createCascadeAdapter: expected at least one adapter\""
    );
  });
});

