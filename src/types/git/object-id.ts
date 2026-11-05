/** A git object id as git prints it: 40 hex digits, or 64 in a SHA-256 repository. */
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export const isObjectId = (value: string): boolean => OBJECT_ID.test(value);
