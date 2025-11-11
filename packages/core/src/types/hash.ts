export type Hash = string;

export type HashFn = (input: Uint8Array) => Promise<Hash> | Hash;

