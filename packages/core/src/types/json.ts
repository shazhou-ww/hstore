/**
 * JSON scalar values.
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON array containing nested JSON values.
 */
export type JsonArray = ReadonlyArray<JsonValue>;

/**
 * JSON object with string keys mapped to JSON values.
 */
export type JsonObject = { readonly [key: string]: JsonValue };

/**
 * Any JSON-compatible value.
 */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

