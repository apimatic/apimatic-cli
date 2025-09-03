import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { BuildConfig } from "./build/build.js";
import { ZipService } from "../infrastructure/zip-service.js";

export class BuildContext {
  private readonly fileService = new FileService();
  private readonly buildDirectory: DirectoryPath;
  private readonly zipService = new ZipService();

  constructor(buildDirectory: DirectoryPath) {
    this.buildDirectory = buildDirectory;
  }

  private get buildFile(): FilePath {
    // TODO: add checks for build file path
    return new FilePath(this.buildDirectory, new FileName("APIMATIC-BUILD.json"));
  }

  private get specDirectory(): DirectoryPath {
    return this.buildDirectory.join("spec");
  }

  public async validate(): Promise<boolean> {
    // TODO: add more checks here
    if (!(await this.fileService.directoryExists(this.buildDirectory))) return false;

    return await this.fileService.fileExists(this.buildFile);
  }

  public async exists(): Promise<boolean> {
    return !(await this.fileService.directoryEmpty(this.buildDirectory));
  }

  public async getBuildFileContents(): Promise<BuildConfig> {
    const buildFileContent = await this.fileService.getContents(this.buildFile);
    return JSON.parse(buildFileContent) as BuildConfig;
  }

  public async updateBuildFileContents(buildJson: BuildConfig) {
    await this.fileService.writeContents(this.buildFile, JSON.stringify(buildJson, null, 2));
  }

  public async replaceDefaultSpec(specPath: FilePath) {
    await this.fileService.deleteFile(new FilePath(this.specDirectory, new FileName("openapi.json")));
    if (await this.fileService.isZipFile(specPath)) {
      await this.zipService.unArchive(specPath, this.specDirectory);
    } else {
      await this.fileService.copy(specPath, specPath.replaceDirectory(this.specDirectory));
    }
  }

  public async deleteWorkflowDir() {
    await this.fileService.deleteDirectory(this.buildDirectory.join(".github"));
  }
}

