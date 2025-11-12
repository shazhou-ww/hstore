# @hstore/leveldb-adapter

LevelDB-backed storage adapter for `@hstore/core`.

## Installation

```sh
bun add @hstore/leveldb-adapter classic-level
```

## Usage

```ts
import { createLevelAdapter } from "@hstore/leveldb-adapter";
import { createStore } from "@hstore/core";
import { z } from "zod";

const schema = z.object({ message: z.string() }).strict();

const adapter = await createLevelAdapter({
  location: "./data/hstore",
});

const store = await createStore({ schema, adapter, hashFn: /* ... */ });

await store.commit({ message: "hello" });

await adapter.close();
```

### Options

| Option            | Type      | Default | Description                           |
| ----------------- | --------- | ------- | ------------------------------------- |
| `location`        | `string`  | —       | Filesystem path for the LevelDB store |
| `createIfMissing` | `boolean` | `true`  | Create the database if it is missing  |
| `compression`     | `boolean` | `true`  | Enable Snappy compression             |

### Lifecycle Helpers

The adapter extends the core `StorageAdapter` API with:

- `close(): Promise<void>` – closes the underlying database.
- `clear(): Promise<void>` – removes all key/value pairs.

These are useful for test cleanup or controlled shutdown.

## Testing

```sh
bun run --filter=@hstore/leveldb-adapter test
```

