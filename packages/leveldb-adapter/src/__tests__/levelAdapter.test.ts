import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import type { StoredBlock } from "@hstore/core";
import { createLevelAdapter } from "../levelAdapter";

const tempDir = async () =>
  mkdtemp(join(tmpdir(), "hstore-leveldb-adapter-"));

const sampleBlock = (hash: string, seed = 0): StoredBlock => ({
  hash: hash as StoredBlock["hash"],
  bytes: new Uint8Array([seed, seed + 1, seed + 2]),
});

const withAdapter = async (
  location: string,
  fn: (adapter: Awaited<ReturnType<typeof createLevelAdapter>>) => Promise<void>
) => {
  const adapter = await createLevelAdapter({ location });
  try {
    await fn(adapter);
  } finally {
    await adapter.close();
  }
};

describe("createLevelAdapter", () => {
  test("writes and reads blocks", async () => {
    const dir = await tempDir();
    await withAdapter(dir, async (adapter) => {
      const block = sampleBlock("root");
      await adapter.write(block);
      const loaded = await adapter.read("root");

      expect(loaded).toEqual(block);
      expect(loaded).not.toBe(block);
    });
    await rm(dir, { recursive: true, force: true });
  });

  test("returns undefined for missing hash", async () => {
    const dir = await tempDir();
    await withAdapter(dir, async (adapter) => {
      const result = await adapter.read("missing");
      expect(result).toBeUndefined();
    });
    await rm(dir, { recursive: true, force: true });
  });

  test("does not expose mutable internals", async () => {
    const dir = await tempDir();
    await withAdapter(dir, async (adapter) => {
      const block = sampleBlock("immutable", 10);
      await adapter.write(block);

      const loaded = await adapter.read("immutable");
      if (!loaded) {
        throw new Error("Expected block");
      }

      expect(loaded.bytes).not.toBe(block.bytes);
      const original = loaded.bytes[0];
      loaded.bytes[0] = original + 7;

      const reread = await adapter.read("immutable");
      expect(reread?.bytes[0]).toBe(original);
    });
    await rm(dir, { recursive: true, force: true });
  });

  test("persists data across instances", async () => {
    const dir = await tempDir();
    try {
      await withAdapter(dir, async (adapter) => {
        await adapter.write(sampleBlock("persist", 5));
      });

      await withAdapter(dir, async (adapter) => {
        const loaded = await adapter.read("persist");
        expect(loaded?.bytes).toEqual(new Uint8Array([5, 6, 7]));
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

