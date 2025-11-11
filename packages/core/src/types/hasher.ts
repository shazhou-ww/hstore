import type { Hash } from "./hash";
import type { HNode } from "./node";
import type { JsonValue } from "./json";

export type HashNode = (node: HNode) => Promise<Hash>;

export type HashValue = (value: JsonValue) => Promise<Hash>;

export type SerializeNode = (node: HNode) => Uint8Array;

export type Hasher = Readonly<{
  hashNode: HashNode;
  hashValue: HashValue;
  serializeNode: SerializeNode;
}>;

