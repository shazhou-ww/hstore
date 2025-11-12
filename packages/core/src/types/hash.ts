/**
 * Identifier produced by hashing node content.
 */
export type Hash = string;

/**
 * Function capable of hashing UTF-8 encoded node payloads.
 */
export type HashFn = (input: Uint8Array) => Promise<Hash> | Hash;

