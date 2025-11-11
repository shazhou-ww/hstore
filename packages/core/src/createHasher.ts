import { TextEncoder } from "util";
import type { Hash, HashFn } from "./types/hash";
import type { Hasher } from "./types/hasher";
import type {
  ArrayNode,
  HNode,
  ObjectNode,
  PrimitiveNode
} from "./types/node";
import type { JsonArray, JsonObject, JsonPrimitive, JsonValue } from "./types/json";

type CanonicalNode =
  | readonly ["primitive", JsonPrimitive]
  | readonly ["array", ReadonlyArray<Hash>]
  | readonly ["object", ReadonlyArray<readonly [string, Hash]>];

const textEncoder = new TextEncoder();

const canonicalizeNode = (node: HNode): CanonicalNode => {
  if (node.kind === "primitive") {
    return ["primitive", node.value];
  }

  if (node.kind === "array") {
    return ["array", [...node.elements]];
  }

  const sorted = [...node.entries].sort((left, right) =>
    left.key.localeCompare(right.key)
  );

  return [
    "object",
    sorted.map((entry) => [entry.key, entry.hash] as const)
  ];
};

const serializeNode = (node: HNode): Uint8Array => {
  const canonical = canonicalizeNode(node);
  return textEncoder.encode(JSON.stringify(canonical));
};

const createHashNode = (hashFn: HashFn) => async (node: HNode): Promise<Hash> =>
  hashFn(serializeNode(node));

const isJsonObject = (value: JsonValue): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

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

const createPrimitiveNode = (value: JsonPrimitive): PrimitiveNode => ({
  kind: "primitive",
  value
});

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

export const createHasher = (hashFn: HashFn): Hasher => {
  const hashNode = createHashNode(hashFn);
  const hashValue = (value: JsonValue) => hashValueWith(value, hashNode);

  return Object.freeze({
    hashNode,
    hashValue,
    serializeNode
  });
};

