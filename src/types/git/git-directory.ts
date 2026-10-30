import { FileName } from '../file/fileName.js';

/** The `.git` inside an output directory is the developer's repository, or holds the snapshots, and is never the CLI's to remove or upload. */
export const GIT_DIRECTORY = new FileName('.git');
