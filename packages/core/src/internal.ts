import { TextDecoder, TextEncoder } from "util";

import type {
  FrozenJson,
  Hash,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
} from "./types";

export type HNode =
  | readonly [0, JsonPrimitive]
  | readonly [1, readonly Hash[]]
  | readonly [2, readonly (readonly [string, Hash])[]];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const isJsonPrimitive = (value: JsonValue): value is JsonPrimitive =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

export const sortObjectEntries = (
  entries: ReadonlyArray<readonly [string, JsonValue]>
): ReadonlyArray<readonly [string, JsonValue]> =>
  [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

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
  const frozenEntries = Object.entries(objectValue).map(([key, val]) => [
    key,
    freezeJson(val),
  ] as const);
  return Object.freeze(
    Object.fromEntries(frozenEntries)
  ) as FrozenJson<T>;
};

export const serializeHNode = (node: HNode): Uint8Array =>
  encoder.encode(JSON.stringify(node));

export const deserializeHNode = (bytes: Uint8Array): HNode =>
  JSON.parse(decoder.decode(bytes)) as HNode;

