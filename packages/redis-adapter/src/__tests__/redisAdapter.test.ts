import { describe, expect, test } from "bun:test";

import type { RedisClientType } from "@redis/client";
import type { StoredBlock } from "@hstore/core";

import { createRedisAdapter } from "../redisAdapter";

type MockRedisClient = {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  get: (optsOrKey: unknown, keyMaybe?: unknown) => Promise<Buffer | null>;
  set: (key: string, value: Buffer) => Promise<void>;
};

const block = (hash: string, seed = 0): StoredBlock => ({
  hash,
  bytes: new Uint8Array([seed, seed + 1, seed + 2]),
});

const getKey = (first: unknown, second?: unknown): string =>
  typeof first === "string" ? first : (second as string);

const createMockRedis = () => {
  const store = new Map<string, Uint8Array>();
  let connectCalls = 0;
  let disconnectCalls = 0;

  const mock: MockRedisClient = {
    async connect() {
      connectCalls += 1;
    },
    async disconnect() {
      disconnectCalls += 1;
    },
    async get(optionsOrKey, maybeKey) {
      const key = getKey(optionsOrKey, maybeKey);
      const value = store.get(key);
      return value ? Buffer.from(value) : null;
    },
    async set(key, value) {
      store.set(key, new Uint8Array(value));
    },
  };

  return {
    client: mock as unknown as RedisClientType<any, any, any>,
    store,
    connectCalls: () => connectCalls,
    disconnectCalls: () => disconnectCalls,
    keys: () => [...store.keys()],
  };
};

const adapterFromMock = async (
  mock: ReturnType<typeof createMockRedis>,
  options?: { prefix?: string }
): Promise<ReturnType<typeof createRedisAdapter>> =>
  createRedisAdapter({
    client: mock.client,
    prefix: options?.prefix,
  });

describe("createRedisAdapter", () => {
  test("writes and reads values with cloning", async () => {
    const mock = createMockRedis();
    const adapter = await adapterFromMock(mock);

    const sample = block("root", 1);
    await adapter.write(sample);

    const stored = await adapter.read("root");
    expect(stored).toEqual(sample);
    expect(stored).not.toBe(sample);
    expect(stored?.bytes).not.toBe(sample.bytes);
  });

  test("returns undefined for missing keys", async () => {
    const mock = createMockRedis();
    const adapter = await adapterFromMock(mock);

    const result = await adapter.read("missing");
    expect(result).toBeUndefined();
  });

  test("uses prefix when provided", async () => {
    const mock = createMockRedis();
    const adapter = await adapterFromMock(mock, { prefix: "cache:" });

    const sample = block("prefixed", 4);
    await adapter.write(sample);

    expect(mock.keys()).toContain("cache:prefixed");
  });

  test("does not disconnect provided client on close", async () => {
    const mock = createMockRedis();
    const adapter = await adapterFromMock(mock);

    await adapter.close();

    expect(mock.disconnectCalls()).toBe(0);
  });
});

