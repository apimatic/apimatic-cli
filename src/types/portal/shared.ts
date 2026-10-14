import { FilePath } from '../file/filePath.js';

/** What more than one file claims where only one can have it: an address two pages are served at, or an operation two specifications declare. */
export interface Shared<Key> {
  key: Key;
  files: FilePath[];
}

/** The keys more than one file claims, each with its files in the order claimed. */
export function shared<Key>(claims: { key: Key; file: FilePath }[]): Shared<Key>[] {
  const byKey = new Map<string, Shared<Key>>();
  for (const { key, file } of claims) {
    const claimed = byKey.get(String(key));
    byKey.set(String(key), { key, files: [...(claimed?.files ?? []), file] });
  }
  return [...byKey.values()].filter(({ files }) => files.length > 1);
}
