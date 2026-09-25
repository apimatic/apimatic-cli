import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { ApimaticConfigContext } from './apimatic-config-context.js';
import { BuildConfig } from './build/build.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { PluginConfigContext } from './plugin-config-context.js';
import { PortalSourceContext } from './portal-source-context.js';
import { OUTPUT_DIRECTORY_NAMES, SOURCE_DIRECTORY_NAME, SPEC_DIRECTORY_NAME } from './project-layout.js';
import { Language } from './sdk/generate.js';
import { SdkContext } from './sdk-context.js';
import { SpecContext } from './spec-context.js';
import { TempContext } from './temp-context.js';

export const GITIGNORE = '.gitignore';

// `plugin publish` runs `git init` in /plugin/, so a repository tracking it would nest one inside another.
export const GENERATED: readonly string[] = Object.values(OUTPUT_DIRECTORY_NAMES).map((name) => `/${name}/`);

/** Neither stops a portal being built, so the wizard says so and carries on. */
export type GitignoreFailure = 'unreadable' | 'unwritable';

export type VersionProblem = 'noVersions' | 'versionNotFound';

export class ProjectContext {
  private readonly fileService = new FileService();

  private constructor(
    private readonly projectDirectory: DirectoryPath,
    private readonly source: DirectoryPath,
    private readonly version?: string
  ) {}

  public static at(input: string | undefined): ProjectContext {
    return ProjectContext.in(DirectoryPath.createInput(input));
  }

  public static in(projectDirectory: DirectoryPath): ProjectContext {
    return new ProjectContext(projectDirectory, projectDirectory.join(SOURCE_DIRECTORY_NAME));
  }

  private get buildFile(): FilePath {
    return new FilePath(this.source, new FileName('APIMATIC-BUILD.json'));
  }

  private get gitignore(): FilePath {
    return new FilePath(this.projectDirectory, new FileName(GITIGNORE));
  }

  public sourceDirectory(): DirectoryPath {
    return this.source;
  }

  public sdkDirectory(destination?: string): DirectoryPath {
    return this.outputDirectory(OUTPUT_DIRECTORY_NAMES.sdk, destination);
  }

  public portalDirectory(destination?: string): DirectoryPath {
    return this.outputDirectory(OUTPUT_DIRECTORY_NAMES.portal, destination);
  }

  public pluginDirectory(destination?: string): DirectoryPath {
    return this.outputDirectory(OUTPUT_DIRECTORY_NAMES.plugin, destination);
  }

  public async sourceExists(): Promise<boolean> {
    return await this.fileService.directoryExists(this.source);
  }

  /** For a prompt validator, which cannot await. */
  public sourceExistsSync(): boolean {
    return this.fileService.directoryExistsSync(this.source);
  }

  public async specsExist(): Promise<boolean> {
    return await new SpecContext(this.source.join(SPEC_DIRECTORY_NAME)).validate();
  }

  public async buildZip(tempDirectory: DirectoryPath, packageSettingsDirectory?: DirectoryPath): Promise<FilePath> {
    const staged = tempDirectory.join('build');
    await this.fileService.copyDirectoryContents(this.source, staged);
    if (packageSettingsDirectory) {
      await this.fileService.copyDirectoryContents(packageSettingsDirectory, staged.join('package-settings'));
    }
    return await new TempContext(tempDirectory).zip(staged);
  }

  public async isVersioned(): Promise<boolean> {
    const buildConfig = await this.buildConfig();
    return buildConfig !== undefined && buildConfig.isVersioned();
  }

  public async versionToBuild(
    apiVersion: string | undefined,
    ask: (versions: string[]) => Promise<string | undefined>
  ): Promise<Result<ProjectContext, VersionProblem>> {
    const buildConfig = await this.buildConfig();
    if (buildConfig === undefined || !buildConfig.isVersioned()) {
      return ok(this);
    }

    const versionsDirectory = this.source.join(buildConfig.versionsPath());
    const versions = (await this.fileService.directoryExists(versionsDirectory))
      ? await this.fileService.getSubDirectoriesPaths(versionsDirectory)
      : [];
    if (versions.length === 0) {
      return err('noVersions');
    }
    if (!apiVersion && versions.length === 1) {
      return ok(this.reading(versions[0]));
    }

    const chosen = apiVersion ? apiVersion : await ask(versions.map((version) => version.leafName()));
    const version = versions.find((directory) => directory.leafName() === chosen);
    return version === undefined ? err('versionNotFound') : ok(this.reading(version));
  }

  public sdk(language: Language, sdkDirectory: DirectoryPath): SdkContext {
    return new SdkContext(language, sdkDirectory, this.version);
  }

  public portalSource(): PortalSourceContext {
    return new PortalSourceContext(this.source);
  }

  public pluginConfig(): PluginConfigContext {
    return new PluginConfigContext(this.source);
  }

  public config(): ApimaticConfigContext {
    return new ApimaticConfigContext(this.source);
  }

  /**
   * Appends what is missing and rewrites nothing. A project may already have a `.gitignore` the
   * user wrote, and a run that adds no entry leaves the file untouched.
   */
  public async upsertGitignore(): Promise<Result<void, GitignoreFailure>> {
    let existing: string;
    try {
      existing = (await this.fileService.fileExists(this.gitignore))
        ? await this.fileService.getContents(this.gitignore)
        : '';
    } catch {
      return err('unreadable');
    }

    const listed = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
    const missing = GENERATED.filter((entry) => !listed.has(entry));
    if (missing.length === 0) {
      return ok(undefined);
    }

    const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
    try {
      await this.fileService.writeContents(this.gitignore, `${existing}${separator}${missing.join('\n')}\n`);
    } catch {
      return err('unwritable');
    }
    return ok(undefined);
  }

  private reading(versionDirectory: DirectoryPath): ProjectContext {
    return new ProjectContext(this.projectDirectory, versionDirectory, versionDirectory.leafName());
  }

  private outputDirectory(name: string, destination: string | undefined): DirectoryPath {
    return destination ? new DirectoryPath(destination) : this.projectDirectory.join(name);
  }

  private async buildConfig(): Promise<BuildConfig | undefined> {
    if (!(await this.fileService.fileExists(this.buildFile))) {
      return undefined;
    }
    return BuildConfig.parse(await this.fileService.getContents(this.buildFile));
  }
}
