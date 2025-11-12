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
 * Hashes canonical byte payloads directly.
 */
export type HashBytes = (bytes: Uint8Array) => Promise<Hash>;

/**
 * Composite hasher capable of hashing nodes, values, and canonical bytes.
 */
export type Hasher = Readonly<{
  hashNode: HashNode;
  hashValue: HashValue;
  hashBytes: HashBytes;
}>;

