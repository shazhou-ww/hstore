import { commandOptions, type RedisClientType } from "@redis/client";

import type {
  Hash,
  ReadBlock,
  StorageAdapter,
  StoredBlock,
  WriteBlock,
} from "@hstore/core";

/**
 * Configuration values required to build a Redis-backed adapter.
 */
export type RedisAdapterOptions = Readonly<{
  client: RedisClientType<any, any, any>;
  prefix?: string;
}>;

export type RedisAdapter = StorageAdapter & {
  close(): Promise<void>;
};

/**
 * Clones a buffer to ensure immutability across layers.
 */
const cloneBytes = (bytes: Uint8Array): Uint8Array => new Uint8Array(bytes);

/**
 * Creates a frozen stored block by cloning the payload.
 */
const freezeBlock = (block: StoredBlock): StoredBlock =>
  Object.freeze({
    hash: block.hash,
    bytes: cloneBytes(block.bytes),
  });

/**
 * Builds the Redis key for a given hash and prefix.
 */
const toKey = (hash: Hash, prefix: string): string => `${prefix}${hash}`;

/**
 * Constructs a Redis-backed storage adapter using an existing client.
 */
export const createRedisAdapter = async ({
  client,
  prefix = "hstore:",
}: RedisAdapterOptions): Promise<RedisAdapter> => {
  const getBufferOpts = commandOptions({ returnBuffers: true });

  /**
   * Retrieves a block by hash returning an immutable copy.
   */
  const read: ReadBlock = async (hash) => {
    const key = toKey(hash, prefix);
    const result = (await client.get(
      getBufferOpts,
      key
    )) as Buffer | null;
    if (!result) {
      return undefined;
    }

    return freezeBlock({ hash, bytes: cloneBytes(result) });
  };

  /**
   * Writes a block to Redis, cloning the bytes to avoid mutation.
   */
  const write: WriteBlock = async (record) => {
    const key = toKey(record.hash, prefix);
    await client.set(key, Buffer.from(record.bytes));
  };

  const close = async () => {
    // no-op: lifecycle managed externally
  };

  return Object.freeze({
    read,
    write,
    close,
  });
};

