# @hstore/memory-adapter

In-memory storage adapter for `@hstore/core`, ideal for tests and ephemeral caches.

## Installation

```sh
bun add @hstore/memory-adapter
```

## Usage

```ts
import { createMemoryAdapter } from "@hstore/memory-adapter";
import { createStore } from "@hstore/core";
import { z } from "zod";

const schema = z.object({ message: z.string() }).strict();

const adapter = createMemoryAdapter();

const store = await createStore({
  schema,
  adapter,
  hashFn: /* your hash fn */,
});

await store.commit({ message: "hello" });

const version = await store.head();
console.log(version?.value.message); // "hello"
```

## Features

- **Zero dependencies** – only depends on `@hstore/core`.
- **In-memory storage** – data is stored in a `Map` and cleared when the adapter is garbage collected.
- **Immutable guarantees** – all stored blocks are cloned to prevent shared references.
- **No lifecycle management** – no need to open or close the adapter.

## Use Cases

- **Unit tests** – fast, isolated storage for testing store logic.
- **Ephemeral caches** – temporary storage for session data or in-process caching.
- **Prototyping** – quick development without setting up persistent storage.

## Testing

```sh
bun run --filter=@hstore/memory-adapter test
```

