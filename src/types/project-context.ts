import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { ApimaticConfigContext } from './apimatic-config-context.js';
import { BuildConfig } from './build/build.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';
import { PluginConfigContext } from './plugin-config-context.js';
import { PortalSourceContext, SPEC } from './portal-source-context.js';
import { SpecContext } from './spec-context.js';
import { TempContext } from './temp-context.js';

export const GITIGNORE = '.gitignore';

const SOURCE = 'src';

const BUILD_FILE = 'APIMATIC-BUILD.json';

/** Where `sdk generate`, `portal generate` and `plugin generate` write when told nothing else. */
const OUTPUTS = ['sdk', 'portal', 'plugin'] as const;

type Output = (typeof OUTPUTS)[number];

/**
 * What the CLI generates into a project, which a repository should not carry. Derived from the
 * directories above, so the two cannot name different places.
 *
 * `/plugin/` matters most. `plugin publish` runs `git init` inside that directory and pushes it
 * as its own repository, so a parent tracking it would nest one repository inside another.
 */
export const GENERATED: readonly string[] = OUTPUTS.map((name) => `/${name}/`);

/** Neither stops a portal being built, so the wizard says so and carries on. */
export type GitignoreFailure = 'unreadable' | 'unwritable';

/**
 * A project: the directory a command is pointed at, the source directory inside it, and the
 * directories its output goes to. Every command works through this one object rather than
 * deriving the layout itself, and the contexts that read a part of it are reached from here.
 *
 * A versioned build has one source directory per API version. Narrowing to a version answers a
 * project reading that directory instead, and writing its output to the same places, which is
 * what lets one object serve both.
 */
export class ProjectContext {
  private readonly fileService = new FileService();

  private constructor(
    private readonly projectDirectory: DirectoryPath,
    private readonly source: DirectoryPath,
    private readonly version?: string
  ) {}

  /** What a command has: an `--input` flag that may be absent, which then means where it was run. */
  public static at(input: string | undefined): ProjectContext {
    return ProjectContext.in(DirectoryPath.createInput(input));
  }

  /** For a caller that was handed the directory rather than a flag naming it. */
  public static in(projectDirectory: DirectoryPath): ProjectContext {
    return new ProjectContext(projectDirectory, projectDirectory.join(SOURCE));
  }

  private get gitignore(): FilePath {
    return new FilePath(this.projectDirectory, new FileName(GITIGNORE));
  }

  private get buildFile(): FilePath {
    return new FilePath(this.source, new FileName(BUILD_FILE));
  }

  /** A `--destination` names the directory outright; without one the project's own is used. */
  private output(name: Output, destination: string | undefined): DirectoryPath {
    return destination === undefined ? this.projectDirectory.join(name) : new DirectoryPath(destination);
  }

  /**
   * The directory itself, for the prompts that name it to the reader and the services that copy
   * from it. Everything that only reads it goes through the methods below instead.
   */
  public sourceDirectory(): DirectoryPath {
    return this.source;
  }

  public sdkDirectory(destination?: string): DirectoryPath {
    return this.output('sdk', destination);
  }

  public portalDirectory(destination?: string): DirectoryPath {
    return this.output('portal', destination);
  }

  public pluginDirectory(destination?: string): DirectoryPath {
    return this.output('plugin', destination);
  }

  /** The version this project reads, or undefined when its build declares none. */
  public versionName(): string | undefined {
    return this.version;
  }

  public async sourceExists(): Promise<boolean> {
    return await this.fileService.directoryExists(this.source);
  }

  public sourceExistsSync(): boolean {
    return this.fileService.directoryExistsSync(this.source);
  }

  /** Whether anything at all is in `spec/`, which a build needs before it is worth uploading. */
  public async specsExist(): Promise<boolean> {
    return await new SpecContext(this.source.join(SPEC)).validate();
  }

  /** What one run uploads: the source directory, with the package settings a publish adds to it. */
  public async buildZip(
    tempDirectory: DirectoryPath,
    packageSettingsDirectory?: DirectoryPath
  ): Promise<FilePath> {
    const staged = tempDirectory.join('build');
    await this.fileService.copyDirectoryContents(this.source, staged);
    if (packageSettingsDirectory) {
      await this.fileService.copyDirectoryContents(packageSettingsDirectory, staged.join('package-settings'));
    }
    return await new TempContext(tempDirectory).zip(staged);
  }

  public async isVersioned(): Promise<boolean> {
    if (!(await this.fileService.directoryExists(this.source)) || !(await this.fileService.fileExists(this.buildFile))) {
      return false;
    }
    return (await this.buildConfig()).isVersioned();
  }

  /** Whether the directory the build points its versions at is there and holds any. */
  public async hasVersions(): Promise<boolean> {
    return (await this.versionDirectories()) !== undefined;
  }

  /** The project for the only version there is, so a run with no `--api-version` need not ask. */
  public async onlyVersion(): Promise<ProjectContext | undefined> {
    const versions = await this.versionDirectories();
    return versions?.length === 1 ? this.reading(versions[0]) : undefined;
  }

  /** The project for the version the caller picks out of the names this build carries. */
  public async chosenVersion(
    choose: (versions: string[]) => Promise<string | undefined>
  ): Promise<ProjectContext | undefined> {
    const versions = await this.versionDirectories();
    if (versions === undefined) {
      return undefined;
    }
    const chosen = await choose(versions.map((directory) => directory.leafName()));
    const directory = chosen === undefined ? undefined : versions.find((it) => it.leafName() === chosen);
    return directory === undefined ? undefined : this.reading(directory);
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

  private async buildConfig(): Promise<BuildConfig> {
    return BuildConfig.parse(await this.fileService.getContents(this.buildFile));
  }

  /** The same project reading one version's directory, and writing where it already writes. */
  private reading(versionDirectory: DirectoryPath): ProjectContext {
    return new ProjectContext(this.projectDirectory, versionDirectory, versionDirectory.leafName());
  }

  private async versionDirectories(): Promise<DirectoryPath[] | undefined> {
    const config = await this.buildConfig();
    if (!config.isVersioned()) {
      return undefined;
    }
    const versions = this.source.join(config.versionsPath());
    if (!(await this.fileService.directoryExists(versions))) {
      return undefined;
    }
    const directories = await this.fileService.getSubDirectoriesPaths(versions);
    return directories.length > 0 ? directories : undefined;
  }
}
