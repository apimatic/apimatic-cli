import path from "path";
import { DirectoryPath } from "./directoryPath.js";
import { FileName } from "./fileName.js";
import { FilePath } from "./filePath.js";
import { UrlPath } from "./urlPath.js";
import { ResourceContext } from "../resource-context.js";
import { Result, ok, err } from "neverthrow";

export type ResourceInput = { type: "file"; path: FilePath } | { type: "url"; path: UrlPath };

// Type guard functions
export const isFileResource = (resource: ResourceInput): resource is { type: "file"; path: FilePath } => {
  return resource.type === "file";
};

export const isUrlResource = (resource: ResourceInput): resource is { type: "url"; path: UrlPath } => {
  return resource.type === "url";
};

// Factory function to create the discriminated union
export const createResourceInput = (file?: string, url?: string): ResourceInput => {
  if (file && url) {
    throw new Error("Cannot specify both file and url. Please provide only one.");
  }
  if (!file && !url) {
    throw new Error("Must specify either file or url.");
  }

  if (file) {
    if (typeof file !== "string" || !file.trim()) {
      throw new Error("Invalid file path provided.");
    }
    const filePath = new FilePath(new DirectoryPath(path.dirname(file)), new FileName(path.basename(file)));
    return { type: "file", path: filePath };
  } else {
    if (typeof url !== "string" || !url.trim()) {
      throw new Error("Invalid URL provided.");
    }
    return { type: "url", path: new UrlPath(url) };
  }
};
export const resolveSpecFilePath = async (
  tempDir: DirectoryPath,
  resourcePath: string
): Promise<Result<FilePath, string>> => {
  try {
    const resourceContext = new ResourceContext(tempDir);
    const specFileDirResult = await resourceContext.resolveTo(resourcePath, "spec");

    if (specFileDirResult.isErr()) {
      return specFileDirResult; 
    }

    const resolvedFileName = new FileName(path.basename(resourcePath));
    const filePath = new FilePath(specFileDirResult.value, resolvedFileName);

    return ok<FilePath, string>(filePath);
  } catch (error) {
    return err<FilePath, string>(error instanceof Error ? error.message : "Failed to resolve file path!");
  }
};
