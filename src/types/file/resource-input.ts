import path from "path";
import { DirectoryPath } from "./directoryPath.js";
import { FileName } from "./fileName.js";
import { FilePath } from "./filePath.js";
import { UrlPath } from "./urlPath.js";

export type ResourceInput = FilePath | UrlPath;

// Factory function to create the discriminated union
export const createResourceInput = (file?: string, url?: string): ResourceInput => {
  if (file && url) {
    throw new Error("Cannot specify both file and url. Please provide only one.");
  }
  if (!file && !url) {
    throw new Error("Must specify either file or url.");
  }

  if (file) {
    if (!file.trim()) {
      throw new Error("Invalid file path provided.");
    }
    return new FilePath(new DirectoryPath(path.dirname(file)), new FileName(path.basename(file)));
  }
  if (url) {
    if (!url.trim()) {
      throw new Error("Invalid URL provided.");
    }
    return new UrlPath(url);
  }
  throw new Error("Must specify either file or url.");
};
