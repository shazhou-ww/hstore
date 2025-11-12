# @hstore/cascade-adapter

## Name

@hstore/cascade-adapter

## Description

Write-through cascading adapter that composes multiple storage layers, reading from the fastest and hydrating lower caches as needed.

## Usage

Write through a two-level memory + LevelDB hierarchy:
```ts
import { createCascadeAdapter } from "@hstore/cascade-adapter";
import { createMemoryAdapter } from "@hstore/memory-adapter";
import { createLevelAdapter } from "@hstore/leveldb-adapter";

const memory = createMemoryAdapter();
const level = await createLevelAdapter({ location: "./durable" });

const cascade = createCascadeAdapter({ adapters: [memory, level] });

await cascade.write({
  hash: "alpha",
  bytes: new Uint8Array([1, 2, 3]),
});
```

Add Redis as a durable lower tier beneath memory:
```ts
import { createCascadeAdapter } from "@hstore/cascade-adapter";
import { createMemoryAdapter } from "@hstore/memory-adapter";
import { createRedisAdapter } from "@hstore/redis-adapter";

const redis = await createRedisAdapter({
  client: redisClient, // previously connected Redis client
});

const adapter = createCascadeAdapter({
  adapters: [createMemoryAdapter(), redis],
});
```

