import type { Hash, HashFn } from "./hash";
import type { JsonValue } from "./json";
import type { ReadNode, StorageAdapter } from "./adapter";

export type PersistResult = Readonly<{
  rootHash: Hash;
  nodesWritten: number;
}>;

export type MaterializeOptions = Readonly<{
  limitDepth?: number;
}>;

export type MaterializeResult = Readonly<{
  value: JsonValue;
  visited: number;
}>;

export type Persist = (value: JsonValue) => Promise<PersistResult>;

export type Materialize = (
  hash: Hash,
  options?: MaterializeOptions
) => Promise<MaterializeResult>;

export type HStore = Readonly<{
  persist: Persist;
  materialize: Materialize;
  readNode: ReadNode;
}>;

export type CreateStoreOptions = Readonly<{
  hashFn: HashFn;
  adapter: StorageAdapter;
}>;

export type CreateStore = (options: CreateStoreOptions) => HStore;

