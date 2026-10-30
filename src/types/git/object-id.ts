/** A git object id as git prints it: 40 hex digits, or 64 in a SHA-256 repository. */
export const OBJECT_ID = '(?:[0-9a-f]{40}|[0-9a-f]{64})';

const WHOLE = new RegExp(`^${OBJECT_ID}$`);

export const isObjectId = (value: string): boolean => WHOLE.test(value);
