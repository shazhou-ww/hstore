import type { Hash } from "./hash";
import type { HNode } from "./node";

export type StoredNode = {
  readonly hash: Hash;
  readonly node: HNode;
};

export type ReadNode = (hash: Hash) => Promise<StoredNode | undefined>;

export type WriteNode = (record: StoredNode) => Promise<void>;

export type StorageAdapter = Readonly<{
  read: ReadNode;
  write: WriteNode;
}>;

