import { describe, expect, test } from "bun:test";
import type { StoredNode } from "@hstore/core";
import { createMemoryAdapter } from "../memoryAdapter";

const sampleNode = (hash: string): StoredNode => ({
  hash,
  node: {
    kind: "object",
    entries: [
      { key: "foo", hash: "foo-hash" },
      { key: "bar", hash: "bar-hash" }
    ]
  }
});

describe("createMemoryAdapter", () => {
  test("reads back stored nodes", async () => {
    const adapter = createMemoryAdapter();
    const original = sampleNode("root");

    await adapter.write(original);
    const retrieved = await adapter.read("root");

    expect(retrieved).toEqual(original);
    expect(retrieved).not.toBe(original);
  });

  test("exposes immutable stored structures", async () => {
    const adapter = createMemoryAdapter();
    const original = sampleNode("immutable");

    await adapter.write(original);
    const retrieved = await adapter.read("immutable");

    if (!retrieved) {
      throw new Error("missing");
    }

    expect(Object.isFrozen(retrieved.node)).toBe(true);

    if (retrieved.node.kind === "object") {
      expect(Object.isFrozen(retrieved.node.entries)).toBe(true);
    }
  });

  test("seeds initial nodes", async () => {
    const seeded = sampleNode("seed");
    const adapter = createMemoryAdapter({ seed: [seeded] });

    const result = await adapter.read("seed");
    expect(result).toEqual(seeded);
  });
});

