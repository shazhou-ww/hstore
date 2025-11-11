import type {
  HNode,
  Hash,
  ObjectNode,
  StorageAdapter,
  StoredNode
} from "@hstore/core";

export type MemoryAdapterOptions = Readonly<{
  seed?: Iterable<StoredNode>;
}>;

const copyNode = (node: HNode): HNode => {
  if (node.kind === "primitive") {
    return {
      kind: "primitive",
      value: node.value
    };
  }

  if (node.kind === "array") {
    return {
      kind: "array",
      elements: [...node.elements]
    };
  }

  const objectNode = node as ObjectNode;

  return {
    kind: "object",
    entries: objectNode.entries.map((entry: ObjectNode["entries"][number]): { key: string; hash: Hash } => ({
      key: entry.key,
      hash: entry.hash
    }))
  };
};

const freezeNode = (node: HNode): HNode => {
  if (node.kind === "primitive") {
    return Object.freeze({
      kind: "primitive",
      value: node.value
    });
  }

  if (node.kind === "array") {
    return Object.freeze({
      kind: "array",
      elements: Object.freeze([...node.elements])
    });
  }

  const objectNode = node as ObjectNode;
  const entries = objectNode.entries.map((entry: ObjectNode["entries"][number]): { key: string; hash: Hash } =>
    Object.freeze({
      key: entry.key,
      hash: entry.hash
    })
  );

  return Object.freeze({
    kind: "object",
    entries: Object.freeze(entries)
  });
};

const freezeStoredNode = (record: StoredNode): StoredNode =>
  Object.freeze({
    hash: record.hash,
    node: freezeNode(record.node)
  });

const cloneStoredNode = (record: StoredNode): StoredNode =>
  freezeStoredNode({
    hash: record.hash,
    node: copyNode(record.node)
  });

const seedStore = (
  map: Map<Hash, StoredNode>,
  options?: MemoryAdapterOptions
): void => {
  if (!options?.seed) {
    return;
  }

  for (const record of options.seed) {
    map.set(record.hash, freezeStoredNode(record));
  }
};

export const createMemoryAdapter = (
  options?: MemoryAdapterOptions
): StorageAdapter => {
  const store = new Map<Hash, StoredNode>();
  seedStore(store, options);

  const read: StorageAdapter["read"] = async (hash: Hash) => {
    const record = store.get(hash);
    return record ? cloneStoredNode(record) : undefined;
  };

  const write: StorageAdapter["write"] = async (record: StoredNode) => {
    store.set(record.hash, freezeStoredNode(record));
  };

  return Object.freeze({
    read,
    write
  });
};

