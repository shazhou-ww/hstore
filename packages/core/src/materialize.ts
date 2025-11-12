import type { JsonArray, JsonObject, JsonValue } from "./types/json";
import type { Hash } from "./types/hash";
import type { HNode, ObjectNode } from "./types/node";
import type { StorageAdapter } from "./types/adapter";
import type { MaterializeOptions, MaterializeResult } from "./types/store";

/**
 * Context shared across materialization steps, providing access to storage and the depth budget.
 */
type MaterializeContext = Readonly<{
  adapter: StorageAdapter;
  depthLimit: number;
}>;

/**
 * Result of visiting a node, including the computed JSON value and the number of nodes reached.
 */
type VisitOutcome = Readonly<{
  value: JsonValue;
  visited: number;
}>;

/**
 * Expands an array node into a JSON array, respecting the remaining depth budget.
 */
const asArrayValue = async (
  node: HNode,
  context: MaterializeContext,
  depth: number
): Promise<VisitOutcome> => {
  if (node.kind !== "array") {
    throw new Error("Expected array node");
  }

  const nextDepth = depth - 1;

  if (nextDepth < 0) {
    return { value: node.elements as unknown as JsonArray, visited: 1 };
  }

  const children = await Promise.all(
    node.elements.map((hash) => materializeHash(hash, context, nextDepth))
  );

  const value = children.map((child) => child.value) as JsonArray;
  const visited = 1 + children.reduce((sum, child) => sum + child.visited, 0);

  return { value, visited };
};

/**
 * Expands an object node into a JSON object, respecting the remaining depth budget.
 */
const asObjectValue = async (
  node: HNode,
  context: MaterializeContext,
  depth: number
): Promise<VisitOutcome> => {
  if (node.kind !== "object") {
    throw new Error("Expected object node");
  }

  const nextDepth = depth - 1;

  if (nextDepth < 0) {
    const placeholder: Record<string, JsonValue> = {};

    for (const entry of node.entries) {
      placeholder[entry.key] = entry.hash;
    }

    return { value: placeholder as JsonObject, visited: 1 };
  }

  const pairs = await Promise.all(
    node.entries.map(async (entry) => {
      const child = await materializeHash(entry.hash, context, nextDepth);
      return [entry.key, child] as const;
    })
  );

  const value = pairs.reduce<Record<string, JsonValue>>(
    (accumulator, [key, outcome]) => {
      accumulator[key] = outcome.value;
      return accumulator;
    },
    {}
  );

  const visited =
    1 + pairs.reduce((sum, [, outcome]) => sum + outcome.visited, 0);

  return { value: value as JsonObject, visited };
};

/**
 * Returns the primitive value stored in a primitive node.
 */
const asPrimitiveValue = (node: HNode): VisitOutcome => {
  if (node.kind !== "primitive") {
    throw new Error("Expected primitive node");
  }

  return { value: node.value, visited: 1 };
};

/**
 * Resolves a hash to its JSON value by traversing the underlying node structure.
 */
const materializeHash = async (
  hash: Hash,
  context: MaterializeContext,
  depth: number
): Promise<VisitOutcome> => {
  if (depth < 0) {
    return { value: hash, visited: 0 };
  }

  const record = await context.adapter.read(hash);

  if (!record) {
    throw new Error(`Missing node for hash "${hash}"`);
  }

  if (record.node.kind === "primitive") {
    return asPrimitiveValue(record.node);
  }

  if (record.node.kind === "array") {
    return asArrayValue(record.node, context, depth);
  }

  return asObjectValue(record.node, context, depth);
};

/**
 * Converts materialization options into a numeric depth limit.
 */
const resolveDepthLimit = (options?: MaterializeOptions): number => {
  if (!options || options.limitDepth === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  return options.limitDepth;
};

/**
 * Materializes a stored tree, returning the JSON value and the number of visited nodes.
 */
export const materialize = async (
  hash: Hash,
  adapter: StorageAdapter,
  options?: MaterializeOptions
): Promise<MaterializeResult> => {
  const depthLimit = resolveDepthLimit(options);
  const context: MaterializeContext = { adapter, depthLimit };
  const outcome = await materializeHash(hash, context, depthLimit);

  return {
    value: outcome.value,
    visited: outcome.visited
  };
};

