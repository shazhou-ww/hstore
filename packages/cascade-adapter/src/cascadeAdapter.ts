import type {
  Hash,
  ReadBlock,
  StorageAdapter,
  StoredBlock,
  WriteBlock,
} from "@hstore/core";

export type CascadeAdapterOptions = Readonly<{
  adapters: ReadonlyArray<StorageAdapter>;
}>;

export type CascadeAdapter = StorageAdapter;

const freezeBlock = (block: StoredBlock): StoredBlock =>
  Object.freeze({
    hash: block.hash,
    bytes: new Uint8Array(block.bytes),
  });

const ensureAdapters = (
  adapters: ReadonlyArray<StorageAdapter>
): readonly StorageAdapter[] => {
  if (adapters.length === 0) {
    throw new Error("createCascadeAdapter: expected at least one adapter");
  }
  return Array.from(adapters);
};

export const createCascadeAdapter = ({
  adapters,
}: CascadeAdapterOptions): CascadeAdapter => {
  const layers = ensureAdapters(adapters);

  const read: ReadBlock = async (hash: Hash) => {
    let block: StoredBlock | undefined;
    let hitIndex = -1;

    for (let index = 0; index < layers.length; index += 1) {
      block = await layers[index].read(hash);
      if (block) {
        hitIndex = index;
        break;
      }
    }

    if (!block) {
      return undefined;
    }

    const frozen = freezeBlock(block);

    if (hitIndex > 0) {
      const writes = layers
        .slice(0, hitIndex)
        .map((layer) => layer.write(frozen));
      await Promise.all(writes);
    }

    return frozen;
  };

  const write: WriteBlock = async (record: StoredBlock) => {
    const frozen = freezeBlock(record);
    await Promise.all(layers.map((layer) => layer.write(frozen)));
  };

  return {
    read,
    write,
  };
};

