import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';

export const GITIGNORE = '.gitignore';

const SOURCE = 'src';

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
 * The directory that contains a source directory: what every command is pointed at, and the one
 * place that knows where a project keeps its source and its output.
 */
export class ProjectContext {
  private readonly fileService = new FileService();

  private constructor(private readonly projectDirectory: DirectoryPath) {}

  /** What a command has: an `--input` flag that may be absent, which then means where it was run. */
  public static at(input: string | undefined): ProjectContext {
    return new ProjectContext(DirectoryPath.createInput(input));
  }

  /** For a caller that was handed the directory rather than a flag naming it. */
  public static in(projectDirectory: DirectoryPath): ProjectContext {
    return new ProjectContext(projectDirectory);
  }

  private get gitignore(): FilePath {
    return new FilePath(this.projectDirectory, new FileName(GITIGNORE));
  }

  /** A `--destination` names the directory outright; without one the project's own is used. */
  private output(name: Output, destination: string | undefined): DirectoryPath {
    return destination === undefined ? this.projectDirectory.join(name) : new DirectoryPath(destination);
  }

  public sourceDirectory(): DirectoryPath {
    return this.projectDirectory.join(SOURCE);
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
}
