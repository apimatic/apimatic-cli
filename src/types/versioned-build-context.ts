import * as path from "path";
import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";

export class VersionedBuildContext {
  private readonly fileService = new FileService();
  private readonly versionedDocsDir: DirectoryPath;

  constructor(buildDirectory: DirectoryPath) {
    this.versionedDocsDir = buildDirectory.join("versioned_docs");
  }

  public async exists(): Promise<boolean> {
    return this.fileService.directoryExists(this.versionedDocsDir);
  }

  public async getResolvedBuildDirectory(): Promise<DirectoryPath | null> {
    const subDirs = await this.fileService.getSubDirectoriesPaths(this.versionedDocsDir);
    if (subDirs.length === 0) 
      return null;
    return subDirs[0];
  }

  public getRelativePath(resolvedDirectory: DirectoryPath): string {
    return path.join(".", "src", "versioned_docs", resolvedDirectory.leafName());
  }
}
