import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";

export class VersionedBuildContext {
  private readonly fileService = new FileService();
  private readonly buildDirectory: DirectoryPath;
  private buildConfig: Record<string, unknown> | undefined;

  constructor(buildDirectory: DirectoryPath) {
    this.buildDirectory = buildDirectory;
  }

  private async getBuildConfig(): Promise<Record<string, unknown> | undefined> {
    if (this.buildConfig !== undefined) {
      return this.buildConfig;
    }
    const buildJsonPath = new FilePath(this.buildDirectory, new FileName("APIMATIC-BUILD.json"));
    if (!(await this.fileService.fileExists(buildJsonPath))) {
      return undefined;
    }
    const contents = await this.fileService.getContents(buildJsonPath);
    this.buildConfig = JSON.parse(contents);
    return this.buildConfig;
  }

  public async isVersioned(): Promise<boolean> {
    const config = await this.getBuildConfig();
    return config !== undefined && "generateVersionedPortal" in config;
  }

  public async getVersionsDirectory(): Promise<DirectoryPath> {
    const config = await this.getBuildConfig();
    const versionsPath = (config?.versionsPath as string) ?? "versioned_docs";
    return this.buildDirectory.join(versionsPath);
  }

  public async getVersionDirectories(): Promise<DirectoryPath[]> {
    const versionsDir = await this.getVersionsDirectory();
    if (!(await this.fileService.directoryExists(versionsDir))) {
      return [];
    }
    const subDirs = await this.fileService.getSubDirectoriesPaths(versionsDir);
    return subDirs.filter((d) => d.leafName().startsWith("version-"));
  }

  public async resolveVersionDirectory(apiVersion: string): Promise<DirectoryPath | null> {
    const versionDirs = await this.getVersionDirectories();
    return versionDirs.find((dir) => dir.leafName() === apiVersion) ?? null;
  }
}
