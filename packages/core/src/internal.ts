import { TextDecoder, TextEncoder } from "util";

import type {
  FrozenJson,
  Hash,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
} from "./types";

type JsonEntry = readonly [string, JsonValue];
type JsonEntryList = ReadonlyArray<JsonEntry>;
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
 * Runtime guard checking if a JSON value is a primitive.
 */
export const isJsonPrimitive = (value: JsonValue): value is JsonPrimitive =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

/**
 * Returns a sorted copy of object entries to ensure deterministic hashing.
 */
export const sortObjectEntries = (entries: JsonEntryList): JsonEntryList =>
  [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * Deeply freezes JSON values to guarantee immutability.
 */
export const freezeJson = <T extends JsonValue>(value: T): FrozenJson<T> => {
  if (isJsonPrimitive(value)) {
    return value as FrozenJson<T>;
  }

  if (Array.isArray(value)) {
    const arrayValue = value as JsonArray;
    const frozenItems = arrayValue.map((item) => freezeJson(item));
    return Object.freeze(frozenItems) as FrozenJson<T>;
  }

  const objectValue = value as JsonObject;
  const entries = Object.entries(objectValue) as JsonEntry[];
  const frozenEntries = entries.map(
    ([key, val]) => [key, freezeJson(val)] as JsonEntry
  );
  return Object.freeze(Object.fromEntries(frozenEntries)) as FrozenJson<T>;
};

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

