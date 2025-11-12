# @hstore/core

## Name

@hstore/core

## Description

Foundational content-addressable store that hashes JSON graphs into immutable DAG versions, validates commits via schemas, and exposes a simple `commit/get/head` API.

## Usage

Commit and retrieve versions backed by the in-memory adapter:
```ts
import { createStore } from "@hstore/core";
import { createMemoryAdapter } from "@hstore/memory-adapter";
import { createHash } from "crypto";
import { z } from "zod";

const sha256 = (input: Uint8Array) =>
  createHash("sha256").update(input).digest("hex");

const schema = z.object({
  todo: z.array(z.object({ title: z.string(), done: z.boolean() })),
});

const store = await createStore({
  hashFn: sha256,
  adapter: createMemoryAdapter(),
  schema,
});

const version = await store.commit({
  todo: [{ title: "ship hstore", done: false }],
});

const latest = await store.head();
console.log(latest?.hash === version.hash); // true
```

Combine multiple adapters into a cascade and commit string payloads:
```ts
import { createStore } from "@hstore/core";
import { createLevelAdapter } from "@hstore/leveldb-adapter";
import { createCascadeAdapter } from "@hstore/cascade-adapter";
import { createMemoryAdapter } from "@hstore/memory-adapter";
import { z } from "zod";

const memory = createMemoryAdapter();
const level = await createLevelAdapter({ location: "./data/store" });
const adapter = createCascadeAdapter({ adapters: [memory, level] });

const store = await createStore({
  hashFn: (bytes) => Bun.crypto.hash("sha256", bytes, "hex"),
  adapter,
  schema: z.string(),
});

await store.commit("hello cascade");
```

