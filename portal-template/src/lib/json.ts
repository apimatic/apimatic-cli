/** Whether a parsed JSON value is an object, as opposed to an array, `null` or a primitive. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
