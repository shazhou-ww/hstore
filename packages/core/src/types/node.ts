import type { Hash } from "./hash";
import type { JsonPrimitive } from "./json";

/**
 * Union of supported node kinds.
 */
export type NodeKind = "primitive" | "array" | "object";

/**
 * Node storing a JSON primitive value.
 */
export type PrimitiveNode = {
  readonly kind: "primitive";
  readonly value: JsonPrimitive;
};

/**
 * Node storing hashes of child elements representing an array.
 */
export type ArrayNode = {
  readonly kind: "array";
  readonly elements: ReadonlyArray<Hash>;
};

/**
 * Entry linking an object property name to the hash of its value node.
 */
export type ObjectEntry = {
  readonly key: string;
  readonly hash: Hash;
};

/**
 * Node storing hashed entries representing an object.
 */
export type ObjectNode = {
  readonly kind: "object";
  readonly entries: ReadonlyArray<ObjectEntry>;
};

/**
 * Union of all supported hashed node shapes.
 */
export type HNode = PrimitiveNode | ArrayNode | ObjectNode;

