import { TextDecoder, TextEncoder } from "util";

import type {
  CreateStore,
  FrozenJson,
  Hash,
  JsonValue,
  StateVersion,
  CreateStoreOptions,
} from "./types";
import { createObjectStore } from "./objectStore";
import { freezeJson } from "./internal";

type VersionBlock = Readonly<{
  value: Hash;
  previous: Hash | null;
  timestamp: number;
}>;

const HEAD_KEY: Hash = "__hstore_head__";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const encodeVersionBlock = (block: VersionBlock): Uint8Array =>
  encoder.encode(JSON.stringify(block));

const decodeVersionBlock = (bytes: Uint8Array): VersionBlock =>
  JSON.parse(decoder.decode(bytes)) as VersionBlock;

const encodeHead = (hash: Hash | null): Uint8Array =>
  encoder.encode(JSON.stringify({ head: hash }));

const decodeHead = (bytes: Uint8Array): Hash | null => {
  try {
    const data = JSON.parse(decoder.decode(bytes)) as { head?: unknown };
    return typeof data.head === "string" ? data.head : null;
  } catch {
    return null;
  }
};

const isVersionBlock = (value: unknown): value is VersionBlock => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const timestamp = record.timestamp;
  const previous = record.previous;
  const nodeValue = record.value;

  return (
    typeof timestamp === "number" &&
    (typeof previous === "string" || previous === null) &&
    typeof nodeValue === "string"
  );
};

export const createStore: CreateStore = async <T extends JsonValue>({
  adapter,
  hashFn,
  schema,
}: CreateStoreOptions<T>) => {
  const objectStore = createObjectStore({ adapter, hashFn });
  const versionCache = new Map<Hash, StateVersion<T>>();

  let headMemo: Hash | null = (await (async () => {
    const stored = await adapter.read(HEAD_KEY);
    if (!stored) {
      await adapter.write({ hash: HEAD_KEY, bytes: encodeHead(null) });
      return null;
    }

    const decoded = decodeHead(stored.bytes);
    if (decoded === null) {
      await adapter.write({ hash: HEAD_KEY, bytes: encodeHead(null) });
    }

    return decoded;
  })()) ?? null;

  const rememberVersion = (
    hash: Hash,
    block: VersionBlock,
    value: FrozenJson<T>
  ): StateVersion<T> => {
    const version: StateVersion<T> = {
      hash,
      value,
      previous: block.previous,
      timestamp: block.timestamp,
    };
    versionCache.set(hash, version);
    return version;
  };

  const persistHead = async (hash: Hash | null) => {
    await adapter.write({ hash: HEAD_KEY, bytes: encodeHead(hash) });
    headMemo = hash;
  };

  const loadVersion = async (hash: Hash): Promise<StateVersion<T> | null> => {
    const cached = versionCache.get(hash);
    if (cached) {
      return cached;
    }

    const block = await adapter.read(hash);
    if (!block) {
      return null;
    }

    const parsed = decodeVersionBlock(block.bytes);
    if (!isVersionBlock(parsed)) {
      return null;
    }

    const value = await objectStore.read(parsed.value);
    if (value === undefined) {
      return null;
    }

    return rememberVersion(hash, parsed, value as FrozenJson<T>);
  };

  const writeVersion = async (
    block: VersionBlock,
    value: FrozenJson<T>
  ): Promise<StateVersion<T>> => {
    const bytes = encodeVersionBlock(block);
    const hash = await Promise.resolve(hashFn(bytes));

    if (!versionCache.has(hash)) {
      await adapter.write({ hash, bytes });
    }

    return rememberVersion(hash, block, value);
  };

  const head = async (): Promise<StateVersion<T> | null> => {
    const current = headMemo;
    if (!current) {
      return null;
    }

    return loadVersion(current);
  };

  const get = (hash: Hash): Promise<StateVersion<T> | null> => loadVersion(hash);

  const commit = async (input: T): Promise<StateVersion<T>> => {
    const parsed = await schema.parseAsync(input);
    const valueHash = await objectStore.write(parsed);
    const cachedValue = (await objectStore.read(valueHash)) as
      | FrozenJson<T>
      | undefined;
    const frozenValue =
      cachedValue ?? (freezeJson(parsed as JsonValue) as FrozenJson<T>);

    const previous = headMemo;
    const block: VersionBlock = {
      value: valueHash,
      previous,
      timestamp: Date.now(),
    };

    const version = await writeVersion(block, frozenValue);
    await persistHead(version.hash);
    return version;
  };

  return {
    commit,
    get,
    head,
  };
};

