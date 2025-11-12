import type {
  Hash,
  ReadBlock,
  StorageAdapter,
  StoredBlock,
  WriteBlock,
} from "@hstore/core";

const cloneBytes = (bytes: Uint8Array): Uint8Array => new Uint8Array(bytes);

const freezeStoredBlock = (record: StoredBlock): StoredBlock =>
  Object.freeze({
    hash: record.hash,
    bytes: cloneBytes(record.bytes)
  });

const cloneStoredBlock = (record: StoredBlock): StoredBlock =>
  freezeStoredBlock({
    hash: record.hash,
    bytes: record.bytes
  });

export const createMemoryAdapter = (): StorageAdapter => {
  const store = new Map<Hash, StoredBlock>();

  const read: ReadBlock = async (hash) => {
    const record = store.get(hash);
    return record ? cloneStoredBlock(record) : undefined;
  };

  const write: WriteBlock = async (record) => {
    store.set(record.hash, freezeStoredBlock(record));
  };

  return { read, write };
};

