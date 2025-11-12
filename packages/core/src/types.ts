import type { ZodType } from "zod";

/**
 * Stable content address identifier used throughout the store.
 */
export type Hash = string;

/**
 * Deterministic hashing function that maps serialized bytes to a hash string.
 */
export type HashFn = (input: Uint8Array) => Promise<Hash> | Hash;

/**
 * JSON literal values accepted by the store.
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON object representation backed by frozen values.
 */
export type JsonObject = { readonly [key: string]: JsonValue };

export type JsonArray = ReadonlyArray<JsonValue>;

export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export type FrozenJson<T extends JsonValue> = T extends JsonPrimitive
  ? T
  : T extends JsonArray
    ? ReadonlyArray<FrozenJson<T[number]>>
    : T extends JsonObject
      ? { readonly [K in keyof T]: FrozenJson<T[K]> }
      : never;

export type StoredBlock = Readonly<{
  hash: Hash;
  bytes: Uint8Array;
}>;

/**
 * Adapter interface for retrieving persisted blocks by hash.
 */
export type ReadBlock = (hash: Hash) => Promise<StoredBlock | undefined>;

/**
 * Adapter interface for persisting content-addressed blocks.
 */
export type WriteBlock = (record: StoredBlock) => Promise<void>;

/**
 * Storage adapter providing low-level block persistence.
 */
export type StorageAdapter = {
  read: ReadBlock;
  write: WriteBlock;
};

export type StateVersion<T extends JsonValue> = Readonly<{
  hash: Hash;
  value: FrozenJson<T>;
  previous: Hash | null;
  timestamp: number;
}>;

/**
 * Configuration required to bootstrap an HStore instance.
 */
export type CreateStoreOptions<T extends JsonValue> = Readonly<{
  hashFn: HashFn;
  adapter: StorageAdapter;
  schema: ZodType<T>;
}>;

/**
 * High-level store API exposing immutable version history backed by CAS DAG.
 */
export type HStore<T extends JsonValue> = Readonly<{
  commit(value: T): Promise<StateVersion<T>>;
  head(): Promise<StateVersion<T> | null>;
  get(hash: Hash): Promise<StateVersion<T> | null>;
}>;

/**
 * Factory method that produces a new schema-validated, versioned store.
 */
export type CreateStore = <T extends JsonValue>(
  options: CreateStoreOptions<T>
) => Promise<HStore<T>>;

