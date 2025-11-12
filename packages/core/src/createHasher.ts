import { TextDecoder, TextEncoder } from "util";
import type { Hash, HashFn } from "./types/hash";
import type { Hasher } from "./types/hasher";
import type { ArrayNode, HNode, ObjectNode, PrimitiveNode } from "./types/node";
import type {
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue
} from "./types/json";

/**
 * Canonical representation of a node used for stable serialization prior to hashing.
 */
type CanonicalKind = 0 | 1 | 2;

const canonicalKind = {
  primitive: 0 as CanonicalKind,
  array: 1 as CanonicalKind,
  object: 2 as CanonicalKind
} as const;

type CanonicalNode =
  | readonly [typeof canonicalKind.primitive, JsonPrimitive]
  | readonly [typeof canonicalKind.array, ReadonlyArray<Hash>]
  | readonly [
      typeof canonicalKind.object,
      ReadonlyArray<readonly [string, Hash]>
    ];

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const serializeCanonical = (canonical: CanonicalNode): Uint8Array =>
  textEncoder.encode(JSON.stringify(canonical));

/**
 * Produces a canonical tuple-based structure from a node, ensuring deterministic ordering.
 */
const canonicalizeNode = (node: HNode): CanonicalNode => {
  if (node.kind === "primitive") {
    return [canonicalKind.primitive, node.value];
  }

  if (node.kind === "array") {
    return [canonicalKind.array, [...node.elements]];
  }

  const sorted = [...node.entries].sort((left, right) =>
    left.key.localeCompare(right.key)
  );

  return [
    canonicalKind.object,
    sorted.map((entry) => [entry.key, entry.hash] as const)
  ];
};

/**
 * Serializes a node into UTF-8 bytes of its canonical JSON representation.
 */
export const serializeNode = (node: HNode): Uint8Array => {
  const canonical = canonicalizeNode(node);
  return serializeCanonical(canonical);
};

export const serializeCanonicalPrimitive = (value: JsonPrimitive): Uint8Array =>
  serializeCanonical([canonicalKind.primitive, value]);

export const serializeCanonicalArray = (
  hashes: ReadonlyArray<Hash>
): Uint8Array => serializeCanonical([canonicalKind.array, [...hashes]]);

export const serializeCanonicalObject = (
  entries: ReadonlyArray<{ key: string; hash: Hash }>
): Uint8Array =>
  serializeCanonical([
    canonicalKind.object,
    entries.map((entry) => [entry.key, entry.hash] as const)
  ]);

const toObjectEntries = (
  entries: ReadonlyArray<readonly [string, Hash]>
): ReadonlyArray<{ key: string; hash: Hash }> =>
  entries.map(([key, hash]) => ({ key, hash }));

const fromCanonical = (canonical: CanonicalNode): HNode => {
  const [kind, payload] = canonical;

  if (kind === canonicalKind.primitive) {
    return {
      kind: "primitive",
      value: payload as JsonPrimitive
    };
  }

  if (kind === canonicalKind.array) {
    return {
      kind: "array",
      elements: payload as ReadonlyArray<Hash>
    };
  }

  return {
    kind: "object",
    entries: toObjectEntries(payload as ReadonlyArray<readonly [string, Hash]>)
  };
};

/**
 * Deserializes canonical node bytes back into an HNode.
 */
export const deserializeNode = (bytes: Uint8Array): HNode => {
  const json = textDecoder.decode(bytes);
  const canonical = JSON.parse(json) as CanonicalNode;
  return fromCanonical(canonical);
};

/**
 * Wraps a hash function to operate over nodes by first serializing them.
 */
const createHashNode = (hashFn: HashFn) => async (node: HNode): Promise<Hash> =>
  hashFn(serializeNode(node));

/**
 * Type guard determining whether a JSON value is a non-null object.
 */
const isJsonObject = (value: JsonValue): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Hashes an arbitrary JSON value by first converting it into nodes.
 */
const hashValueWith = async (
  value: JsonValue,
  hashNode: (node: HNode) => Promise<Hash>
): Promise<Hash> => {
  if (value === null) {
    return hashNode(createPrimitiveNode(value));
  }

  if (typeof value !== "object") {
    return hashNode(createPrimitiveNode(value));
  }

  if (Array.isArray(value)) {
    return hashNode(await createArrayNode(value, hashNode));
  }

  if (!isJsonObject(value)) {
    throw new TypeError("Expected JsonObject");
  }

  return hashNode(await createObjectNode(value, hashNode));
};

/**
 * Creates a primitive node from a JSON primitive value.
 */
const createPrimitiveNode = (value: JsonPrimitive): PrimitiveNode => ({
  kind: "primitive",
  value
});

/**
 * Builds an array node by hashing each element using the supplied node hasher.
 */
const createArrayNode = async (
  values: JsonArray,
  hashNode: (node: HNode) => Promise<Hash>
): Promise<ArrayNode> => {
  const elements: Hash[] = [];

  for (const item of values) {
    const hash = await hashValueWith(item, hashNode);
    elements.push(hash);
  }

  return {
    kind: "array",
    elements
  };
};

/**
 * Builds an object node by hashing each property value using the supplied node hasher.
 */
const createObjectNode = async (
  value: JsonObject,
  hashNode: (node: HNode) => Promise<Hash>
): Promise<ObjectNode> => {
  const keys = Object.keys(value).sort((left, right) =>
    left.localeCompare(right)
  );

  const entries = await Promise.all(
    keys.map(async (key) => ({
      key,
      hash: await hashValueWith(value[key], hashNode)
    }))
  );

  return {
    kind: "object",
    entries
  };
};

/**
 * Creates a hasher capable of hashing HNodes and raw JSON values.
 */
export const createHasher = (hashFn: HashFn): Hasher => {
  const hashNode = createHashNode(hashFn);
  const hashValue = (value: JsonValue) => hashValueWith(value, hashNode);
  const hashBytes = (bytes: Uint8Array) =>
    Promise.resolve(hashFn(bytes));

  return Object.freeze({
    hashNode,
    hashValue,
    hashBytes
  });
};

