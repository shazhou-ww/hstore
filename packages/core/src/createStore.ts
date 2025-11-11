import { createHasher } from "./createHasher";
import { materialize } from "./materialize";
import { persistJsonValue, type PersistContext } from "./persist";
import type { CreateStore, CreateStoreOptions, HStore } from "./types/store";

const toContext = (options: CreateStoreOptions): PersistContext => {
  const hasher = createHasher(options.hashFn);
  return {
    adapter: options.adapter,
    hasher
  };
};

const createPersist =
  (context: PersistContext): HStore["persist"] =>
  async (value) =>
    persistJsonValue(value, context);

const createMaterialize =
  (context: PersistContext): HStore["materialize"] =>
  async (hash, options) =>
    materialize(hash, context.adapter, options);

export const createStore: CreateStore = (options) => {
  const context = toContext(options);

  return Object.freeze({
    persist: createPersist(context),
    materialize: createMaterialize(context),
    readNode: context.adapter.read
  });
};

