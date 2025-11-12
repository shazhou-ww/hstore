import type { Hash, HashFn } from "./hash";
import type { JsonValue } from "./json";
import type { ReadNode, StorageAdapter } from "./adapter";

/**
 * Outcome of persisting a value, including the root hash and write count.
 */
export type PersistResult = Readonly<{
  rootHash: Hash;
  nodesWritten: number;
}>;

/**
 * Options controlling how materialization traverses node graphs.
 */
export type MaterializeOptions = Readonly<{
  limitDepth?: number;
}>;

/**
 * Outcome of materializing a hash back into JSON.
 */
export type MaterializeResult = Readonly<{
  value: JsonValue;
  visited: number;
}>;

/**
 * Persists a JSON value and returns metadata about the operation.
 */
export type Persist = (value: JsonValue) => Promise<PersistResult>;

/**
 * Materializes a stored hash back into JSON.
 */
export type Materialize = (
  hash: Hash,
  options?: MaterializeOptions
) => Promise<MaterializeResult>;

/**
 * High-level store API exposing persistence and materialization helpers.
 */
export type HStore = Readonly<{
  persist: Persist;
  materialize: Materialize;
  readNode: ReadNode;
}>;

/**
 * Options required to create a new store instance.
 */
export type CreateStoreOptions = Readonly<{
  hashFn: HashFn;
  adapter: StorageAdapter;
}>;

/**
 * Factory creating immutable store instances.
 */
export type CreateStore = (options: CreateStoreOptions) => HStore;

