import type { Hash } from "./hash";
import type { HNode } from "./node";
import type { JsonValue } from "./json";

/**
 * Hashes a node into its canonical hash value.
 */
export type HashNode = (node: HNode) => Promise<Hash>;

/**
 * Hashes an arbitrary JSON value by converting it into nodes.
 */
export type HashValue = (value: JsonValue) => Promise<Hash>;

/**
 * Serializes a node into a deterministic byte representation.
 */
export type SerializeNode = (node: HNode) => Uint8Array;

/**
 * Composite hasher capable of serializing and hashing nodes and JSON values.
 */
export type Hasher = Readonly<{
  hashNode: HashNode;
  hashValue: HashValue;
  serializeNode: SerializeNode;
}>;

