import type { Hash } from "./hash";
import type { JsonPrimitive } from "./json";

export type NodeKind = "primitive" | "array" | "object";

export type PrimitiveNode = {
  readonly kind: "primitive";
  readonly value: JsonPrimitive;
};

export type ArrayNode = {
  readonly kind: "array";
  readonly elements: ReadonlyArray<Hash>;
};

export type ObjectEntry = {
  readonly key: string;
  readonly hash: Hash;
};

export type ObjectNode = {
  readonly kind: "object";
  readonly entries: ReadonlyArray<ObjectEntry>;
};

export type HNode = PrimitiveNode | ArrayNode | ObjectNode;

