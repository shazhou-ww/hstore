## @hstore/redis-adapter

Redis-backed storage adapter for `@hstore/core`, supporting write-through persistence with optional key prefixing.

### Installation

```sh
bun add @hstore/redis-adapter @redis/client
```

### Usage

```ts
import { createClient } from "@redis/client";
import { createRedisAdapter } from "@hstore/redis-adapter";
import { createStore } from "@hstore/core";
import { z } from "zod";

const schema = z.object({ message: z.string() }).strict();

const client = createClient({ url: "redis://localhost:6379" });
await client.connect();

const adapter = await createRedisAdapter({
  client,
  prefix: "hstore:",
});

const store = await createStore({
  schema,
  hashFn: /* your hash fn */,
  adapter,
});

await store.commit({ message: "hello" });

await adapter.close();
await client.disconnect();
```

### Options

| Option   | Type                         | Default    | Description                                        |
| -------- | ---------------------------- | ---------- | -------------------------------------------------- |
| `client` | `RedisClientType`            | —          | Connected Redis client instance (required).        |
| `prefix` | `string`                     | `"hstore:"` | Key prefix applied to all stored hashes.           |

The adapter does not manage client lifecycle; create and connect the client yourself and disconnect when you no longer need it.

### Testing

Adapters can be tested with mocked clients by supplying a minimal object implementing `connect`, `disconnect`, `get`, and `set`. The included unit tests demonstrate this approach without requiring a live Redis instance.

### API

The adapter returns a `StorageAdapter` extended with:

- `close(): Promise<void>` — disconnects the internally managed Redis client when applicable.

All reads and writes clone `Uint8Array` payloads to prevent shared references between cache layers and callers.

