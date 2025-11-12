# object-hash-store

Functional, content-addressable storage for evolving JSON state. The repo is a Bun workspace composed of focused packages so adapters and hashing strategies can evolve independently.

## Workspace

- `@hstore/core`: immutable DAG model, hashing utilities, persistence pipeline, and store factory.
- `@hstore/memory-adapter`: in-memory storage adapter ideal for tests and ephemeral caches.
- `@hstore/leveldb-adapter`: persistent adapter built on LevelDB.
- `@hstore/cascade-adapter`: write-through multi-layer cache that composes multiple adapters.
- `@hstore/redis-adapter`: Redis-backed adapter using `@redis/client`.

## Quick Start

```bash
# install & link workspace packages
bun install

# type-check all packages
bun run lint

# execute unit tests across the workspace
bun run test
```

### Package Scripts

Each package exposes standard scripts:

- `bun run --filter=@hstore/<package> lint`
- `bun run --filter=@hstore/<package> test`
- `bun run --filter=@hstore/<package> build`

## Using the Store

```ts
import { createStore } from "@hstore/core";
import { createMemoryAdapter } from "@hstore/memory-adapter";
import { createHash } from "crypto";
import { z } from "zod";

const sha256 = (input: Uint8Array) =>
  createHash("sha256").update(input).digest("hex");

const store = await createStore({
  hashFn: sha256,
  adapter: createMemoryAdapter(),
  schema: z
    .object({
      profile: z.object({
        name: z.string(),
        roles: z.array(z.string()),
      }),
    })
    .strict(),
});

const version = await store.commit({
  profile: { name: "Ada Lovelace", roles: ["analyst", "programmer"] },
});

const fetched = await store.get(version.hash);
console.log(fetched?.value.profile.name); // "Ada Lovelace"
```

### Why DAG Nodes?

- Every primitive, array, and object becomes a node addressed by its hash.
- Identical content reuses hashes instead of duplicating storage.
- Adapters receive immutable snapshots, making persistence side-effect free.

## Extending

- **Hashing:** provide any `HashFn` (synchronous or asynchronous) when creating the store.
- **Adapters:** implement the `StorageAdapter` interface or compose existing adapters like LevelDB, Redis, or cascade layers.

## Development Notes

- Source files are authored in TypeScript; packages export from `src/` for fast iteration.
- Workspace tooling targets Bun ≥ 1.3 and TypeScript ≥ 5.6.
