import type {
  Hash,
  ReadBlock,
  StorageAdapter,
  StoredBlock,
  WriteBlock,
} from "@hstore/core";

/**
 * Creates a new Uint8Array copy preserving immutability guarantees.
 */
const cloneBytes = (bytes: Uint8Array): Uint8Array => new Uint8Array(bytes);

/**
 * Produces an immutable stored block by cloning the payload buffer.
 */
const freezeStoredBlock = (record: StoredBlock): StoredBlock =>
  Object.freeze({
    hash: record.hash,
    bytes: cloneBytes(record.bytes)
  });

/**
 * Clones a stored block to prevent shared references across adapters.
 */
const cloneStoredBlock = (record: StoredBlock): StoredBlock =>
  freezeStoredBlock({
    hash: record.hash,
    bytes: record.bytes
  });

/**
 * In-memory StorageAdapter useful for tests and ephemeral caching.
 */
export const createMemoryAdapter = (): StorageAdapter => {
  const store = new Map<Hash, StoredBlock>();

  /**
   * Returns a frozen copy of a stored block when it exists.
   */
  const read: ReadBlock = async (hash) => {
    const record = store.get(hash);
    return record ? cloneStoredBlock(record) : undefined;
  };

  /**
   * Stores a frozen copy of the provided block keyed by its hash.
   */
  const write: WriteBlock = async (record) => {
    store.set(record.hash, freezeStoredBlock(record));
  };

  return { read, write };
};

