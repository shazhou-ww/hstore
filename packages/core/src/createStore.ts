import { createHasher, deserializeNode, serializeNode } from "./createHasher";
import { createImmutableMaterializer } from "./materialize";
import { persistJsonValue, type PersistContext } from "./persist";
import type { Hash } from "./types/hash";
import type { JsonObject, JsonValue } from "./types/json";
import type { PrimitiveNode } from "./types/node";
import type {
  CreateStore,
  CreateStoreOptions,
  FrozenJson,
  HStore,
  StateVersion
} from "./types/store";

const HEAD_KEY = "@@hstore/head" as Hash;

type VersionMetadata = Readonly<{
  state: Hash;
  previous: Hash | null;
  timestamp: number;
}>;

type FrozenMetadata = FrozenJson<JsonObject> &
  Readonly<{
    state: string;
    previous: string | null;
    timestamp: number;
  }>;

const isFrozenMetadata = (value: FrozenJson<JsonValue>): value is FrozenMetadata =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const createPrimitiveNode = (value: string | null): PrimitiveNode => ({
  kind: "primitive",
  value
});

const readHead = async (context: PersistContext): Promise<Hash | null> => {
  const record = await context.adapter.read(HEAD_KEY);

  if (!record) {
    return null;
  }

  const node = deserializeNode(record.bytes);

  if (node.kind !== "primitive") {
    throw new Error("Head pointer corrupted");
  }

  const { value } = node;

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Head pointer must be a string hash");
  }

  return value as Hash;
};

const writeHead = async (
  context: PersistContext,
  hash: Hash
): Promise<void> => {
  const bytes = serializeNode(createPrimitiveNode(hash));
  await context.adapter.write({
    hash: HEAD_KEY,
    bytes
  });
};

const ensureMetadata = (value: FrozenJson<JsonValue>): FrozenMetadata => {
  if (!isFrozenMetadata(value)) {
    throw new Error("Version metadata is malformed");
  }

  if (typeof value.state !== "string") {
    throw new Error("Version metadata missing state hash");
  }

  if (
    value.previous !== null &&
    typeof value.previous !== "string"
  ) {
    throw new Error("Version metadata has invalid previous link");
  }

  if (typeof value.timestamp !== "number") {
    throw new Error("Version metadata has invalid timestamp");
  }

  return value;
};

const isMissingNodeError = (error: unknown): boolean =>
  error instanceof Error && error.message.startsWith("Missing node");

export const createStore: CreateStore = <T extends JsonValue>(
  options: CreateStoreOptions<T>
): HStore<T> => {
  const hasher = createHasher(options.hashFn);
  const materializer = createImmutableMaterializer(options.adapter);
  const persistContext: PersistContext = {
    adapter: options.adapter,
    hasher,
    hints: materializer.caches.hints
  };

  const toStateVersion = async (
    versionHash: Hash,
    metadata: VersionMetadata
  ): Promise<StateVersion<T>> => {
    const immutableValue = (await materializer.materialize(
      metadata.state
    )) as FrozenJson<T>;

    return {
      hash: versionHash,
      value: immutableValue,
      previous: metadata.previous,
      timestamp: metadata.timestamp
    };
  };

  const loadVersion = async (
    versionHash: Hash
  ): Promise<StateVersion<T> | null> => {
    try {
      const metadataValue = await materializer.materialize(versionHash);
      const metadata = ensureMetadata(metadataValue);
      const resolved: VersionMetadata = {
        state: metadata.state as Hash,
        previous: (metadata.previous as Hash | null) ?? null,
        timestamp: metadata.timestamp
      };

      return toStateVersion(versionHash, resolved);
    } catch (error) {
      if (isMissingNodeError(error)) {
        return null;
      }

      throw error;
    }
  };

  const commit = async (value: T): Promise<StateVersion<T>> => {
    const parsed = options.schema.parse(value);
    const stateOutcome = await persistJsonValue(parsed, persistContext);
    const previousVersion = await readHead(persistContext);
    const metadata: VersionMetadata = {
      state: stateOutcome.hash,
      previous: previousVersion,
      timestamp: Date.now()
    };
    const metadataOutcome = await persistJsonValue(metadata, persistContext);
    await writeHead(persistContext, metadataOutcome.hash);

    const persistedVersion = await loadVersion(metadataOutcome.hash);

    if (!persistedVersion) {
      throw new Error("Failed to load version after commit");
    }

    return persistedVersion;
  };

  return Object.freeze({
    commit,
    head: async () => {
      const headHash = await readHead(persistContext);

      if (!headHash) {
        return null;
      }

      return loadVersion(headHash);
    },
    get: async (hash) => loadVersion(hash)
  });
};

