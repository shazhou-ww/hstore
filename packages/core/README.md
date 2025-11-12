# @hstore/core

Content-addressable JSON store with immutable version history and pluggable storage backends.

## Features

- **Content Addressable DAG** – every JSON node is hashed and deduplicated.
- **Immutable Versions** – each commit returns a frozen snapshot with `previous` linkage.
- **Storage Adapter Abstraction** – plug in any block storage implementation.
- **Schema Validation** – integrate Zod schemas to validate data before persistence.

## Installation

```sh
bun add @hstore/core
```

## Quick Start

```ts
import { createStore } from "@hstore/core";
import { z } from "zod";

const schema = z
  .object({
    message: z.string(),
    data: z.array(z.number()),
  })
  .strict();

const store = await createStore({
  schema,
  hashFn: (bytes) => crypto.createHash("sha256").update(bytes).digest("hex"),
  adapter: {
    async read(hash) {
      return memory.get(hash);
    },
    async write(block) {
      memory.set(block.hash, block);
    },
  },
});

const first = await store.commit({ message: "hello", data: [1, 2, 3] });
const head = await store.head();
const same = await store.get(first.hash);
```

## API

### `createStore(options)`

Creates a new store instance once the head pointer has been initialized.

```ts
type CreateStoreOptions<T extends JsonValue> = Readonly<{
  hashFn: HashFn;
  adapter: StorageAdapter;
  schema: ZodType<T>;
}>; // see packages/core/src/types.ts for details

type HStore<T> = Readonly<{
  commit(value: T): Promise<StateVersion<T>>;
  head(): Promise<StateVersion<T> | null>;
  get(hash: Hash): Promise<StateVersion<T> | null>;
}>;
```

### `StorageAdapter`

Adapters persist raw blocks encoded as `Uint8Array` and keyed by hash.

```ts
type StorageAdapter = Readonly<{
  read(hash: Hash): Promise<StoredBlock | undefined>;
  write(block: StoredBlock): Promise<void>;
}>;
```

## Testing

```sh
bun test
```

## License

MIT © 2025 hstore contributors

