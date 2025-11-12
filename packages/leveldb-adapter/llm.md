# @hstore/leveldb-adapter

## Name

@hstore/leveldb-adapter

## Description

LevelDB-backed storage adapter that persists content-addressable nodes to disk with optional compression and lifecycle helpers.

## Usage

Persist blocks to LevelDB and close when finished:
```ts
import { createLevelAdapter } from "@hstore/leveldb-adapter";

const adapter = await createLevelAdapter({
  location: "./data/hstore",
  compression: true,
});

await adapter.write({
  hash: "block-1",
  bytes: new Uint8Array([10, 11, 12]),
});

await adapter.close();
```

Use LevelDB as a durable layer beneath an in-memory cache:
```ts
import { createLevelAdapter } from "@hstore/leveldb-adapter";
import { createCascadeAdapter } from "@hstore/cascade-adapter";
import { createMemoryAdapter } from "@hstore/memory-adapter";

const level = await createLevelAdapter({ location: "./persistent" });
const memory = createMemoryAdapter();

const adapter = createCascadeAdapter({ adapters: [memory, level] });
```

