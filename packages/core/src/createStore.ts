import { TextDecoder, TextEncoder } from "util";

import type {
  CreateStore,
  CreateStoreOptions,
  FrozenJson,
  Hash,
  JsonValue,
  StateVersion,
} from "./types";
import { createObjectStore } from "./objectStore";
import { freezeJson } from "./utils";

const HEAD_KEY: Hash = "__hstore_head__";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type VersionBlock = Readonly<{
  value: Hash;
  previous: Hash | null;
  timestamp: number;
}>;

type HeadRecord = Readonly<{
  head: Hash | null;
}>;

/**
 * Encodes a version block to bytes for persistence.
 */
const encodeVersionBlock = (block: VersionBlock): Uint8Array =>
  encoder.encode(JSON.stringify(block));

const decodeVersionBlock = (bytes: Uint8Array): VersionBlock =>
  JSON.parse(decoder.decode(bytes)) as VersionBlock;

const toHeadRecord = (hash: Hash | null): HeadRecord => ({ head: hash });

/**
 * Serializes the head pointer record for storage.
 */
const encodeHead = (hash: Hash | null): Uint8Array =>
  encoder.encode(JSON.stringify(toHeadRecord(hash)));

const decodeHead = (bytes: Uint8Array): Hash | null => {
  try {
    const data = JSON.parse(decoder.decode(bytes)) as Partial<HeadRecord>;
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

  let headMemo: Hash | null =
    (await (async () => {
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

  /**
   * Caches a materialized version for quick retrieval.
   */
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

  /**
   * Persists the head pointer and memoises it locally.
   */
  const persistHead = async (hash: Hash | null) => {
    await adapter.write({ hash: HEAD_KEY, bytes: encodeHead(hash) });
    headMemo = hash;
  };

  /**
   * Materializes a version by hash, consulting the adapter when needed.
   */
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

  /**
   * Persists a version block and caches the resolved state value.
   */
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

  /**
   * Returns the latest committed version or null when empty.
   */
  const head = async (): Promise<StateVersion<T> | null> =>
    headMemo ? await loadVersion(headMemo) : null;

  /**
   * Retrieves a specific version by its hash.
   */
  const get = (hash: Hash): Promise<StateVersion<T> | null> =>
    loadVersion(hash);

  /**
   * Validates input against the schema and writes a new immutable version.
   */
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
