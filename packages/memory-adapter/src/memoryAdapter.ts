import type {
  Hash,
  StorageAdapter,
  StoredBlock,
} from "@hstore/core";

export type MemoryAdapterOptions = Readonly<{
  seed?: Iterable<StoredBlock>;
}>;

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

const seedStore = (
  map: Map<Hash, StoredBlock>,
  options?: MemoryAdapterOptions
): void => {
  if (!options?.seed) {
    return;
  }

  for (const record of options.seed) {
    map.set(record.hash, freezeStoredBlock(record));
  }
};

export const createMemoryAdapter = (
  options?: MemoryAdapterOptions
): StorageAdapter => {
  const store = new Map<Hash, StoredBlock>();
  seedStore(store, options);

  const read: StorageAdapter["read"] = async (hash: Hash) => {
    const record = store.get(hash);
    return record ? cloneStoredBlock(record) : undefined;
  };

  const write: StorageAdapter["write"] = async (record: StoredBlock) => {
    store.set(record.hash, freezeStoredBlock(record));
  };

  return Object.freeze({
    read,
    write
  });
};

