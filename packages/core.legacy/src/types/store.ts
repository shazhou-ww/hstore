import type { ZodType } from "zod";
import type { Hash, HashFn } from "./hash";
import type { JsonArray, JsonObject, JsonPrimitive, JsonValue } from "./json";
import type { StorageAdapter } from "./adapter";

/**
 * Recursively readonly JSON value used to represent immutable store payloads.
 */
export type FrozenJson<T extends JsonValue> = T extends JsonPrimitive
  ? T
  : T extends JsonArray
    ? ReadonlyArray<FrozenJson<T[number]>>
    : T extends JsonObject
      ? { readonly [K in keyof T]: FrozenJson<T[K]> }
      : never;

/**
 * Metadata describing a committed state version.
 */
export type StateVersion<T extends JsonValue> = Readonly<{
  hash: Hash;
  value: FrozenJson<T>;
  previous: Hash | null;
  timestamp: number;
}>;

/**
 * Options required to create a typed, versioned store.
 */
export type CreateStoreOptions<T extends JsonValue> = Readonly<{
  hashFn: HashFn;
  adapter: StorageAdapter;
  schema: ZodType<T>;
}>;

/**
 * Versioned store API dedicated to a single typed state chain.
 */
export type HStore<T extends JsonValue> = Readonly<{
  commit(value: T): Promise<StateVersion<T>>;
  head(): Promise<StateVersion<T> | null>;
  get(hash: Hash): Promise<StateVersion<T> | null>;
}>;

/**
 * Factory creating typed versioned store instances.
 */
export type CreateStore = <T extends JsonValue>(
  options: CreateStoreOptions<T>
) => HStore<T>;


