import { DirectoryPath } from '../types/file/directoryPath.js';
import { format as f } from './format.js';

export const notZippedForUpload = (directory: DirectoryPath, reason: string): string =>
  `${f.path(directory)} could not be zipped for upload: ${reason}`;
