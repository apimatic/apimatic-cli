import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { BuildContext } from "./build-context.js";
import { BuildConfig } from "./build/build.js";

// TODO: remove BuildContext from this class
export class VersionedBuildContext {
  private readonly fileService = new FileService();
  private readonly buildContext: BuildContext;
  private readonly buildDirectory: DirectoryPath;
  private buildConfig: BuildConfig | undefined;

  constructor(buildDirectory: DirectoryPath) {
    this.buildDirectory = buildDirectory;
    this.buildContext = new BuildContext(buildDirectory);
  }

  private async getBuildConfig(): Promise<BuildConfig | undefined> {
    if (this.buildConfig !== undefined) {
      return this.buildConfig;
    }
    if (!(await this.buildContext.validate())) {
      return undefined;
    }
    this.buildConfig = await this.buildContext.getBuildFileContents();
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
    return await this.fileService.getSubDirectoriesPaths(versionsDir);
  }

  public async resolveVersionDirectory(apiVersion: string): Promise<DirectoryPath | null> {
    const versionDirs = await this.getVersionDirectories();
    return versionDirs.find((dir) => dir.leafName() === apiVersion) ?? null;
  }
}
