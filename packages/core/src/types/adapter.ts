import type { Hash } from "./hash";
import type { HNode } from "./node";

/**
 * Node record persisted in storage, including its hash and serialized structure.
 */
export type StoredNode = {
  readonly hash: Hash;
  readonly node: HNode;
};

/**
 * Reads a stored node by hash, returning undefined when absent.
 */
export type ReadNode = (hash: Hash) => Promise<StoredNode | undefined>;

/**
 * Persists a node record into storage.
 */
export type WriteNode = (record: StoredNode) => Promise<void>;

/**
 * Adapter interface used to read and write hashed nodes.
 */
export type StorageAdapter = Readonly<{
  read: ReadNode;
  write: WriteNode;
}>;

