import type { ZodType } from "zod";

export type Hash = string;

export type HashFn = (input: Uint8Array) => Promise<Hash> | Hash;

export type JsonPrimitive = string | number | boolean | null;

export type JsonObject = { readonly [key: string]: JsonValue };

export type JsonArray = ReadonlyArray<JsonValue>;

export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export type FrozenJson<T extends JsonValue> = T extends JsonPrimitive
  ? T
  : T extends JsonArray
    ? ReadonlyArray<FrozenJson<T[number]>>
    : T extends JsonObject
      ? { readonly [K in keyof T]: FrozenJson<T[K]> }
      : never;

export type StoredBlock = Readonly<{
  hash: Hash;
  bytes: Uint8Array;
}>;

export type ReadBlock = (hash: Hash) => Promise<StoredBlock | undefined>;

export type WriteBlock = (record: StoredBlock) => Promise<void>;

export type StorageAdapter = Readonly<{
  read: ReadBlock;
  write: WriteBlock;
}>;

export type StateVersion<T extends JsonValue> = Readonly<{
  hash: Hash;
  value: FrozenJson<T>;
  previous: Hash | null;
  timestamp: number;
}>;

export type CreateStoreOptions<T extends JsonValue> = Readonly<{
  hashFn: HashFn;
  adapter: StorageAdapter;
  schema: ZodType<T>;
}>;

export type HStore<T extends JsonValue> = Readonly<{
  commit(value: T): Promise<StateVersion<T>>;
  head(): Promise<StateVersion<T> | null>;
  get(hash: Hash): Promise<StateVersion<T> | null>;
}>;

export type CreateStore = <T extends JsonValue>(
  options: CreateStoreOptions<T>
) => Promise<HStore<T>>;

