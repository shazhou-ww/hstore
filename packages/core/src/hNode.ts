import { TextDecoder, TextEncoder } from "util";

import type {
  Hash,
  JsonPrimitive,
} from "./types";

type ChildHashList = ReadonlyArray<Hash>;
type HashedEntry = readonly [string, Hash];
type HashedEntryList = ReadonlyArray<HashedEntry>;

/**
 * Serialized node representation used for content-addressable storage.
 */
export type HNode =
  | readonly [0, JsonPrimitive]
  | readonly [1, ChildHashList]
  | readonly [2, HashedEntryList];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Serializes an HNode into canonical JSON bytes.
 */
export const serializeHNode = (node: HNode): Uint8Array =>
  encoder.encode(JSON.stringify(node));

/**
 * Deserializes bytes previously produced by `serializeHNode`.
 */
export const deserializeHNode = (bytes: Uint8Array): HNode =>
  JSON.parse(decoder.decode(bytes)) as HNode;

