import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FilePath } from './file/filePath.js';
import { FileName } from './file/fileName.js';
import { BuildConfig } from './build/build.js';
import { SpecContext } from './spec-context.js';
import { TempContext } from './temp-context.js';

export class BuildContext {
  private readonly fileService = new FileService();
  private readonly sourceDirectory: DirectoryPath;

  constructor(sourceDirectory: DirectoryPath) {
    this.sourceDirectory = sourceDirectory;
  }

  private get buildFile(): FilePath {
    // TODO: add checks for build file path
    return new FilePath(this.sourceDirectory, new FileName('APIMATIC-BUILD.json'));
  }

  public async validate(): Promise<boolean> {
    // TODO: add more checks here
    if (!(await this.fileService.directoryExists(this.sourceDirectory))) return false;

    return await this.fileService.fileExists(this.buildFile);
  }

  public async exists(): Promise<boolean> {
    return await this.fileService.directoryExists(this.sourceDirectory);
  }

  public existsSync(): boolean {
    return this.fileService.directoryExistsSync(this.sourceDirectory);
  }

  public async getBuildFileContents(): Promise<BuildConfig> {
    const buildFileContent = await this.fileService.getContents(this.buildFile);
    return BuildConfig.parse(buildFileContent);
  }

  public async getBuildZipPath(tempDir: DirectoryPath, packageSettingsDirectory?: DirectoryPath): Promise<FilePath> {
    const tempContext = new TempContext(tempDir);
    const stagedSourceDirectory = tempDir.join('build');
    await this.fileService.copyDirectoryContents(this.sourceDirectory, stagedSourceDirectory);
    if (packageSettingsDirectory) {
      await this.fileService.copyDirectoryContents(packageSettingsDirectory, stagedSourceDirectory.join('package-settings'));
    }
    return await tempContext.zip(stagedSourceDirectory);
  }

  public getSpecContext(): SpecContext {
    return new SpecContext(this.sourceDirectory.join('spec'));
  }

  public async hasSdkSourceTree(language: string): Promise<boolean> {
    const sourceTreePath = FilePath.create(this.sourceDirectory.join('sdk-source-tree').join(`.${language}`).toString());
    if (!sourceTreePath) {
      return false;
    }
    return await this.fileService.fileExists(sourceTreePath);
  }

  public getSdkSourceTree(language: string): FilePath {
    return FilePath.create(this.sourceDirectory.join('sdk-source-tree').join(`.${language}`).toString())!;
  }

  public async isVersionedBuild(): Promise<boolean> {
    if (!(await this.validate())) {
      return false;
    }
    return (await this.getBuildFileContents()).isVersioned();
  }

  public async getVersionedSourceDirectory(): Promise<DirectoryPath | undefined> {
    const buildConfig = await this.getBuildFileContents();
    if (!buildConfig.isVersioned()) {
      return undefined;
    }
    const versionsDirectory = this.sourceDirectory.join(buildConfig.versionsPath());
    if (!(await this.fileService.directoryExists(versionsDirectory))) {
      return undefined;
    }
    const versionsDirs = await this.fileService.getSubDirectoriesPaths(versionsDirectory);
    return versionsDirs.length > 0 ? versionsDirectory : undefined;
  }

  public async getSingleVersionedSourceDirectory(): Promise<DirectoryPath | undefined> {
    const buildConfig = await this.getBuildFileContents();
    if (!buildConfig.isVersioned()) {
      return undefined;
    }
    const versionsDirectory = this.sourceDirectory.join(buildConfig.versionsPath());
    if (!(await this.fileService.directoryExists(versionsDirectory))) {
      return undefined;
    }
    const versionsDirs = await this.fileService.getSubDirectoriesPaths(versionsDirectory);
    return versionsDirs.length === 1 ? versionsDirs[0] : undefined;
  }

  public async getSelectedVersionedSourceDirectory(
    versionSelector: (versions: string[]) => Promise<string | undefined>
  ): Promise<DirectoryPath | undefined> {
    const buildConfig = await this.getBuildFileContents();
    if (!buildConfig.isVersioned()) {
      return undefined;
    }
    const versionsDirectory = this.sourceDirectory.join(buildConfig.versionsPath());
    if (!(await this.fileService.directoryExists(versionsDirectory))) {
      return undefined;
    }
    const versionsDirs = await this.fileService.getSubDirectoriesPaths(versionsDirectory);
    const selectedVersion = await versionSelector(versionsDirs.map((dir) => dir.leafName()));
    if (!selectedVersion) {
      return undefined;
    }
    return versionsDirs.find((dir) => dir.leafName() === selectedVersion);
  }
}
