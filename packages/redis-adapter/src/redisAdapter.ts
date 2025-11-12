import { commandOptions, type RedisClientType } from "@redis/client";

import type {
  Hash,
  ReadBlock,
  StorageAdapter,
  StoredBlock,
  WriteBlock,
} from "@hstore/core";

export type RedisAdapterOptions = Readonly<{
  client: RedisClientType<any, any, any>;
  prefix?: string;
}>;

export type RedisAdapter = StorageAdapter & {
  close(): Promise<void>;
};

const cloneBytes = (bytes: Uint8Array): Uint8Array => new Uint8Array(bytes);

const freezeBlock = (block: StoredBlock): StoredBlock =>
  Object.freeze({
    hash: block.hash,
    bytes: cloneBytes(block.bytes),
  });

const toKey = (hash: Hash, prefix: string): string => `${prefix}${hash}`;

export const createRedisAdapter = async ({
  client,
  prefix = "hstore:",
}: RedisAdapterOptions): Promise<RedisAdapter> => {
  const getBufferOpts = commandOptions({ returnBuffers: true });

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

