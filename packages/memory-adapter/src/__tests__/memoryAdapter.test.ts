import { describe, expect, test } from "bun:test";
import type { StoredBlock } from "@hstore/core.legacy";
import { createMemoryAdapter } from "../memoryAdapter";

const sampleBlock = (hash: string, seed: number = 0): StoredBlock => ({
  hash,
  bytes: new Uint8Array([seed, seed + 1, seed + 2])
});

describe("createMemoryAdapter", () => {
  test("reads back stored nodes", async () => {
    const adapter = createMemoryAdapter();
    const original = sampleBlock("root");

    await adapter.write(original);
    const retrieved = await adapter.read("root");

    expect(retrieved).toEqual(original);
    expect(retrieved).not.toBe(original);
  });

  test("exposes immutable stored structures", async () => {
    const adapter = createMemoryAdapter();
    const original = sampleBlock("immutable", 10);

    await adapter.write(original);
    const retrieved = await adapter.read("immutable");

    if (!retrieved) {
      throw new Error("missing");
    }

    expect(retrieved.bytes).not.toBe(original.bytes);
    const first = retrieved.bytes[0];
    retrieved.bytes[0] = first + 5;

    const reread = await adapter.read("immutable");
    expect(reread?.bytes[0]).toBe(first);
  });

  test("seeds initial nodes", async () => {
    const seeded = sampleBlock("seed");
    const adapter = createMemoryAdapter({ seed: [seeded] });

    const result = await adapter.read("seed");
    expect(result).toEqual(seeded);
  });
});

