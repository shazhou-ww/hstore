import { ClassicLevel } from "classic-level";

import type {
  Hash,
  ReadBlock,
  StorageAdapter,
  StoredBlock,
  WriteBlock,
} from "@hstore/core";

/**
 * Configuration options for connecting to a LevelDB database.
 */
export type LevelAdapterOptions = Readonly<{
  location: string;
  createIfMissing?: boolean;
  compression?: boolean;
}>;

export type LevelAdapter = StorageAdapter & {
  close(): Promise<void>;
  clear(): Promise<void>;
};

/**
 * Clones a buffer to avoid shared references.
 */
const cloneBytes = (bytes: Uint8Array): Uint8Array => new Uint8Array(bytes);

/**
 * Returns an immutable copy of a stored block.
 */
const freezeBlock = (block: StoredBlock): StoredBlock =>
  Object.freeze({
    hash: block.hash,
    bytes: cloneBytes(block.bytes),
  });

/**
 * Guards for LevelDB "not found" errors to map to undefined reads.
 */
const isNotFoundError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "LEVEL_NOT_FOUND";

/**
 * Creates a LevelDB-backed storage adapter with read/write/close helpers.
 */
export const createLevelAdapter = async ({
  location,
  createIfMissing = true,
  compression = true,
}: LevelAdapterOptions): Promise<LevelAdapter> => {
  const db = new ClassicLevel<Hash, Uint8Array>(location, {
    keyEncoding: "utf8",
    valueEncoding: "view",
    createIfMissing,
    compression,
  });

  await db.open();

  /**
   * Fetches a stored block by hash, hydrating it into an immutable structure.
   */
  const read: ReadBlock = async (hash) => {
    try {
      const bytes = (await db.get(hash)) as Uint8Array | undefined;
      if (bytes === undefined) {
        return undefined;
      }
      return freezeBlock({ hash, bytes: cloneBytes(bytes) });
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  };

  /**
   * Writes a block by hash, cloning bytes for immutability.
   */
  const write: WriteBlock = async (record) => {
    await db.put(record.hash, cloneBytes(record.bytes));
  };

  /**
   * Closes the underlying LevelDB database.
   */
  const close = async () => {
    await db.close();
  };

  /**
   * Clears all key/value pairs from the database.
   */
  const clear = async () => {
    await db.clear();
  };

  return Object.freeze({
    read,
    write,
    close,
    clear,
  }) as LevelAdapter;
};

