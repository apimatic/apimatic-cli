import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { BuildConfig } from "./build/build.js";

export class BuildContext {
  private readonly fileService = new FileService();
  private readonly buildDirectory: DirectoryPath;

  constructor(buildDirectory: DirectoryPath) {
    this.buildDirectory = buildDirectory;
  }

  private get BuildFile(): FilePath {
    // TODO: add checks for build file path
    return new FilePath(this.buildDirectory, new FileName("APIMATIC-BUILD.json"));
  }

  public async validate(): Promise<boolean> {
    // TODO: add more checks here
    if (!(await this.fileService.directoryExists(this.buildDirectory))) return false;

    return await this.fileService.fileExists(this.BuildFile);
  }

  public async exists(): Promise<boolean> {
    return !(await this.fileService.directoryEmpty(this.buildDirectory));
  }

  public async getBuildFileContents(): Promise<BuildConfig> {
    const buildFileContent = await this.fileService.getContents(this.BuildFile);
    return JSON.parse(buildFileContent) as BuildConfig;
  }

  public async updateBuildFileContents(buildJson: BuildConfig) {
    await this.fileService.writeContents(this.BuildFile, JSON.stringify(buildJson, null, 2));
  }
}

