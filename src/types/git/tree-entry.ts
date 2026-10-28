import { RelativeFilePath } from '../file/relativeFilePath.js';

/** One line of `ls-tree -r`: what `path` holds in a tree, and the id of the object holding it. */
export type TreeEntry = { mode: string; type: 'blob' | 'tree' | 'commit'; oid: string; path: RelativeFilePath };
