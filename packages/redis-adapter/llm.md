# @hstore/redis-adapter

## Name

@hstore/redis-adapter

## Description

Redis-backed storage adapter that persists DAG nodes using an existing `@redis/client` connection with optional key prefixing.

## Usage

Persist blocks to Redis with a connected client:
```ts
import { createClient } from "@redis/client";
import { createRedisAdapter } from "@hstore/redis-adapter";

const client = createClient({ url: "redis://localhost:6379" });
await client.connect();

const adapter = await createRedisAdapter({
  client,
  prefix: "hstore:",
});

await adapter.write({
  hash: "block:1",
  bytes: new Uint8Array([42]),
});
```

Pair Redis with an in-memory cache using cascade:
```ts
import { createCascadeAdapter } from "@hstore/cascade-adapter";
import { createMemoryAdapter } from "@hstore/memory-adapter";
import { createRedisAdapter } from "@hstore/redis-adapter";

const redisAdapter = await createRedisAdapter({ client });

const cascade = createCascadeAdapter({
  adapters: [createMemoryAdapter(), redisAdapter],
});
```

