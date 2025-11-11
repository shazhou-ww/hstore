# object-hash-store

Functional, content-addressable storage for evolving JSON state. The repo is a Bun workspace composed of focused packages so adapters and hashing strategies can evolve independently.

## Workspace

- `@hstore/core`: immutable DAG model, hashing utilities, persistence/materialization pipeline, and store factory.
- `@hstore/memory-adapter`: pluggable in-memory persistence adapter that deduplicates nodes and keeps stored data deeply frozen.

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

- `bun run --filter=@hstore/core|@hstore/memory-adapter lint`
- `bun run --filter=@hstore/core|@hstore/memory-adapter test`
- `bun run --filter=@hstore/core|@hstore/memory-adapter build` (project references ready, primarily for publishing workflows)

## Using the Store

```ts
import { createStore } from "@hstore/core";
import { createMemoryAdapter } from "@hstore/memory-adapter";
import { sha256 } from "./hash"; // any async/ sync (Uint8Array) => string hash fn

const store = createStore({
  hashFn: sha256,
  adapter: createMemoryAdapter()
});

const { rootHash } = await store.persist({
  profile: { name: "Ada Lovelace", roles: ["analyst", "programmer"] }
});

const { value } = await store.materialize(rootHash);
```

### Why DAG Nodes?

- Every primitive, array, and object becomes a node addressed by its hash.
- Identical content reuses hashes instead of duplicating storage.
- Adapters receive immutable snapshots, making persistence side-effect free.

## Extending

- **Hashing:** provide any `HashFn` (synchronous or asynchronous) when creating the store.
- **Adapters:** implement the `StorageAdapter` interface to persist nodes to alternative backends (files, KV, etc.).

## Development Notes

- Source files are authored in TypeScript; packages export from `src/` for fast iteration.
- Workspace tooling targets Bun ≥ 1.3 and TypeScript ≥ 5.6.
