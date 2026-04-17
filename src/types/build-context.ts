import { FileService } from "../infrastructure/file-service.js";
import { DirectoryPath } from "./file/directoryPath.js";
import { FilePath } from "./file/filePath.js";
import { FileName } from "./file/fileName.js";
import { BuildConfig } from "./build/build.js";
import { SpecContext } from "./spec-context.js";
import { TempContext } from "./temp-context.js";

export class BuildContext {
  private readonly fileService = new FileService();
  private readonly buildDirectory: DirectoryPath;

  constructor(buildDirectory: DirectoryPath) {
    this.buildDirectory = buildDirectory;
  }

  private get buildFile(): FilePath {
    // TODO: add checks for build file path
    return new FilePath(this.buildDirectory, new FileName("APIMATIC-BUILD.json"));
  }

  public async validate(): Promise<boolean> {
    // TODO: add more checks here
    if (!(await this.fileService.directoryExists(this.buildDirectory))) return false;

    return await this.fileService.fileExists(this.buildFile);
  }

  public async exists(): Promise<boolean> {
    return await this.fileService.directoryExists(this.buildDirectory);
  }

  public existsSync(): boolean {
    return this.fileService.directoryExistsSync(this.buildDirectory);
  }

  public async getBuildFileContents(): Promise<BuildConfig> {
    const buildFileContent = await this.fileService.getContents(this.buildFile);
    return JSON.parse(buildFileContent) as BuildConfig;
  }

  public async updateBuildFileContents(buildJson: BuildConfig) {
    await this.fileService.writeContents(this.buildFile, JSON.stringify(buildJson, null, 2));
  }

  public async deleteWorkflowDir() {
    await this.fileService.deleteDirectory(this.buildDirectory.join(".github"));
  }

  public async getBuildZipPath(tempDir: DirectoryPath, packageSettings?: DirectoryPath): Promise<FilePath> {
    const tempContext = new TempContext(tempDir);
    const tempBuildDir = tempDir.join("build");
    await this.fileService.copyDirectoryContents(this.buildDirectory, tempBuildDir);
    if (packageSettings) {
      await this.fileService.copyDirectoryContents(packageSettings, tempBuildDir.join(packageSettings.leafName()));
    }
    return await tempContext.zip(tempBuildDir);
  }

  public getSpecContext(): SpecContext {
    return new SpecContext(this.buildDirectory.join("spec"));
  }

  public async hasSdkSourceTree(language: string): Promise<boolean> {
    const sourceTreePath = FilePath.create(this.buildDirectory.join("sdk-source-tree").join(`.${language}`).toString());
    if (!sourceTreePath) {
      return false;
    }
    return await this.fileService.fileExists(sourceTreePath);
  }

  public getSdkSourceTree(language: string): FilePath {
    return FilePath.create(this.buildDirectory.join("sdk-source-tree").join(`.${language}`).toString())!;
  }

  public async isVersionedBuild(): Promise<boolean> {
    if (!await this.validate()) {
      return false;
    }
    const buildConfig = await this.getBuildFileContents();
    if (buildConfig.generateVersionedPortal) {
      return true;
    }
    return false;
  }

  public async getVersionedBuildDirectory(): Promise<DirectoryPath | undefined> {
    const buildConfig = await this.getBuildFileContents();
    if (!buildConfig.generateVersionedPortal) {
      return undefined;
    }
    const versionsDirectory = this.buildDirectory.join(buildConfig.versionsPath ?? 'versioned_docs');
    if (!await this.fileService.directoryExists(versionsDirectory)) {
      return undefined;
    }
    const versionsDirs = await this.fileService.getSubDirectoriesPaths(versionsDirectory);
    return versionsDirs.length > 0 ? versionsDirectory : undefined;
  }

  public async getSingleVersionedBuildDirectory(): Promise<DirectoryPath | undefined> {
    const buildConfig = await this.getBuildFileContents();
    if (!buildConfig.generateVersionedPortal) {
      return undefined;
    }
    const versionsDirectory = this.buildDirectory.join(buildConfig.versionsPath ?? 'versioned_docs');
    if (!await this.fileService.directoryExists(versionsDirectory)) {
      return undefined;
    }
    const versionsDirs = await this.fileService.getSubDirectoriesPaths(versionsDirectory);
    return versionsDirs.length === 1 ? versionsDirs[0] : undefined;
  }

  public async getSelectedVersionedBuildDirectory(versionSelector: (versions: string[]) => Promise<string | undefined>): Promise<DirectoryPath | undefined> {
    const buildConfig = await this.getBuildFileContents();
    if (!buildConfig.generateVersionedPortal) {
      return undefined;
    }
    const versionsDirectory = this.buildDirectory.join(buildConfig.versionsPath ?? 'versioned_docs');
    if (!await this.fileService.directoryExists(versionsDirectory)) {
      return undefined;
    }
    const versionsDirs = await this.fileService.getSubDirectoriesPaths(versionsDirectory);
    const selectedVersion = await versionSelector(versionsDirs.map(dir => dir.leafName()));
    if (!selectedVersion) {
      return undefined;
    }
    return versionsDirs.find(dir => dir.leafName() === selectedVersion);

  }
}

