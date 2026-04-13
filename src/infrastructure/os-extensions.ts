import os from 'os';
import { DirectoryPath } from '../types/file/directoryPath.js';

export function getDownloadsDirectory(prefix= 'apimatic'): DirectoryPath {
  return new DirectoryPath(os.homedir()).join('Downloads').join(prefix);
}
