import path from 'path';
import { DirectoryPath } from './directoryPath.js';
import { FileName } from './fileName.js';
import { FilePath } from './filePath.js';
import { UrlPath } from './urlPath.js';
import { removeQuotes } from '../../utils/string-utils.js';
import { ProjectContext } from '../project-context.js';

export type ResourceInput = FilePath | UrlPath | ProjectContext;

export const createResourceInput = (
  file: string | undefined,
  url: string | undefined,
  input: string | undefined
): ResourceInput => (file || url ? createFileOrUrlInput(file, url) : ProjectContext.at(input));

export const createFileOrUrlInput = (file?: string, url?: string): FilePath | UrlPath => {
  if (file && url) {
    throw new Error('Cannot specify both file and url. Please provide only one.');
  }
  if (!file && !url) {
    throw new Error('Must specify either file or url.');
  }

  if (file) {
    if (!file.trim()) {
      throw new Error('Invalid file path provided.');
    }
    return new FilePath(new DirectoryPath(path.dirname(file)), new FileName(path.basename(file)));
  }
  if (url) {
    if (!url.trim()) {
      throw new Error('Invalid URL provided.');
    }
    return new UrlPath(url);
  }
  throw new Error('Must specify either file or url.');
};

export function createResourceInputFromInput(path: string): FilePath | UrlPath | undefined {
  const sanitizedPath = removeQuotes(path.trim() ?? '');
  const urlPath = UrlPath.create(sanitizedPath);
  if (urlPath) {
    return urlPath;
  }
  const filePath = FilePath.create(sanitizedPath);
  if (filePath) {
    return filePath;
  }
  return undefined;
}
