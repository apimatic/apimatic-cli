import { RelativeFilePath } from '../file/relativeFilePath.js';

/** The step a write failed at, in the file system's words; the write undoes nothing, so the caller puts the directory back. */
export type WriteProblem = { file: RelativeFilePath; operation: 'write' | 'remove'; reason: string };
