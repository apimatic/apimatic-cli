import * as path from "path";
import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";

export class VersionedBuildContext {
  private readonly fileService = new FileService();
  private readonly versionedDocsDir: DirectoryPath;
  private _resolvedDirectory: DirectoryPath | null = null;

  constructor(buildDirectory: DirectoryPath) {
    this.versionedDocsDir = buildDirectory.join("versioned_docs");
  }

  public async exists(): Promise<boolean> {
    return this.fileService.directoryExists(this.versionedDocsDir);
  }

  public async validate(): Promise<boolean> {
    const subDirs = await this.fileService.getSubDirectoriesPaths(this.versionedDocsDir);
    if (subDirs.length === 0) 
      return false;
    this._resolvedDirectory = subDirs[0];
    return true;
  }

  public get resolvedBuildDirectory(): DirectoryPath {
    if (!this._resolvedDirectory) {
      throw new Error("Cannot access resolvedBuildDirectory before successful validation.");
    }
    return this._resolvedDirectory;
  }

  public get relativePath(): string {
    return path.join(".", "src", "versioned_docs", this.resolvedBuildDirectory.leafName());
  }
}
