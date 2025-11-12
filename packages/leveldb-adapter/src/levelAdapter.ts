import { ClassicLevel } from "classic-level";

import type {
  Hash,
  ReadBlock,
  StorageAdapter,
  StoredBlock,
  WriteBlock,
} from "@hstore/core";

export type LevelAdapterOptions = Readonly<{
  location: string;
  createIfMissing?: boolean;
  compression?: boolean;
}>;

export type LevelAdapter = StorageAdapter & {
  close(): Promise<void>;
  clear(): Promise<void>;
};

const cloneBytes = (bytes: Uint8Array): Uint8Array => new Uint8Array(bytes);

const freezeBlock = (block: StoredBlock): StoredBlock =>
  Object.freeze({
    hash: block.hash,
    bytes: cloneBytes(block.bytes),
  });

const isNotFoundError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "LEVEL_NOT_FOUND";

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

  const write: WriteBlock = async (record) => {
    await db.put(record.hash, cloneBytes(record.bytes));
  };

  const close = async () => {
    await db.close();
  };

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

