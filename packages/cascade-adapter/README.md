## @hstore/cascade-adapter

Multi-level write-through adapter that stitches together multiple `StorageAdapter`s.

### Installation

```sh
bun add @hstore/cascade-adapter
```

### Usage

```ts
import { createCascadeAdapter } from "@hstore/cascade-adapter";
import { createMemoryAdapter } from "@hstore/memory-adapter";

const fast = createMemoryAdapter();
const durable = await createLevelAdapter({ location: "./data" });

const cascade = createCascadeAdapter({
  adapters: [fast, durable],
});

// All writes propagate through every adapter.
await cascade.write({
  hash: "root",
  bytes: new Uint8Array([1, 2, 3]),
});

// Reads hydrate upper layers when data is found deeper down.
await durable.write({
  hash: "cached",
  bytes: new Uint8Array([4, 5, 6]),
});

await cascade.read("cached"); // populates `fast`
```

### Behavior

- **Write-through**: `write` simultaneously stores blocks on every adapter.
- **Read & hydrate**: `read` queries adapters in order and backfills any higher
  priority adapters above the first hit.
- **Immutability**: Returned blocks and writes are cloned to avoid shared
  object references.

Provide adapters from fastest to slowest to get optimal caching behavior.

