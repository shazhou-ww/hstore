# @hstore/memory-adapter

## Name

@hstore/memory-adapter

## Description

In-memory implementation of the `StorageAdapter` interface that deduplicates nodes, freezes stored data, and is ideal for tests or ephemeral caching layers.

## Usage

Store and retrieve blocks in-memory for testing:
```ts
import { createMemoryAdapter } from "@hstore/memory-adapter";

const adapter = createMemoryAdapter();

await adapter.write({
  hash: "root",
  bytes: new Uint8Array([1, 2, 3]),
});

console.log(await adapter.read("root")?.then((b) => b?.bytes[0])); // 1
```

Combine with persistent storage using a cascade:
```ts
import { createCascadeAdapter } from "@hstore/cascade-adapter";
import { createMemoryAdapter } from "@hstore/memory-adapter";
import { createLevelAdapter } from "@hstore/leveldb-adapter";

const memory = createMemoryAdapter();
const level = await createLevelAdapter({ location: "./cache" });

const cascade = createCascadeAdapter({ adapters: [memory, level] });
```

