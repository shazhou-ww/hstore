import { createHasher } from "./createHasher";
import { materialize } from "./materialize";
import { persistJsonValue, type PersistContext } from "./persist";
import type { CreateStore, CreateStoreOptions, HStore } from "./types/store";

/**
 * Normalizes createStore options into a persist context.
 */
const toContext = (options: CreateStoreOptions): PersistContext => {
  const hasher = createHasher(options.hashFn);
  return {
    adapter: options.adapter,
    hasher
  };
};

/**
 * Creates the persist method bound to a prepared context.
 */
const createPersist =
  (context: PersistContext): HStore["persist"] =>
  async (value) =>
    persistJsonValue(value, context);

/**
 * Creates the materialize method bound to a prepared context.
 */
const createMaterialize =
  (context: PersistContext): HStore["materialize"] =>
  async (hash, options) =>
    materialize(hash, context.adapter, options);

/**
 * Constructs an immutable store that can persist JSON values into hashed storage.
 */
export const createStore: CreateStore = (options) => {
  const context = toContext(options);

  return Object.freeze({
    persist: createPersist(context),
    materialize: createMaterialize(context),
    readNode: context.adapter.read
  });
};

