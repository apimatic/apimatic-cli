import { RelativeDirectoryPath } from './relativeDirectoryPath.js';
import { RelativeFilePath } from './relativeFilePath.js';

/** Files and directories below one root, each kind kept to its own type. */
export type RelativePaths = {
  files: readonly RelativeFilePath[];
  directories: readonly RelativeDirectoryPath[];
};

export const NO_PATHS: RelativePaths = { files: [], directories: [] };
