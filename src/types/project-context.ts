import { err, ok, Result } from 'neverthrow';
import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';

export const GITIGNORE = '.gitignore';

/**
 * What the CLI generates into a project, which a repository should not carry: where
 * `sdk generate`, `portal generate` and `plugin generate` write by default.
 *
 * `/plugin/` matters most. `plugin publish` runs `git init` inside that directory and pushes it
 * as its own repository, so a parent tracking it would nest one repository inside another.
 */
export const GENERATED: readonly string[] = ['/sdk/', '/portal/', '/plugin/'];

/** Neither stops a portal being built, so the wizard says so and carries on. */
export type GitignoreFailure = 'unreadable' | 'unwritable';

export class ProjectContext {
  private readonly fileService = new FileService();

  constructor(private readonly projectDirectory: DirectoryPath) {}

  private get gitignore(): FilePath {
    return new FilePath(this.projectDirectory, new FileName(GITIGNORE));
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
