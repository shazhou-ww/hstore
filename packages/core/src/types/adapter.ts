import type { Hash } from "./hash";

/**
 * Canonical payload persisted for a hash, stored as raw bytes.
 */
export type StoredBlock = Readonly<{
  hash: Hash;
  bytes: Uint8Array;
}>;

/**
 * Reads a stored block by hash, returning undefined when absent.
 */
export type ReadBlock = (hash: Hash) => Promise<StoredBlock | undefined>;

/**
 * Persists a canonical block into storage.
 */
export type WriteBlock = (record: StoredBlock) => Promise<void>;

/**
 * Adapter interface used to read and write canonical hash blocks.
 */
export type StorageAdapter = Readonly<{
  read: ReadBlock;
  write: WriteBlock;
}>;

