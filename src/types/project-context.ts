import { FileService } from '../infrastructure/file-service.js';
import { DirectoryPath } from './file/directoryPath.js';
import { FileName } from './file/fileName.js';
import { FilePath } from './file/filePath.js';

const GITIGNORE = '.gitignore';

/**
 * What the CLI generates into a project, which a repository should not carry: where
 * `sdk generate`, `portal generate` and `plugin generate` write by default.
 *
 * `/plugin/` matters most. `plugin publish` runs `git init` inside that directory and pushes it
 * as its own repository, so a parent tracking it would nest one repository inside another.
 */
const GENERATED: readonly string[] = ['/sdk/', '/portal/', '/plugin/'];

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
  public async upsertGitignore(): Promise<void> {
    const existing = (await this.fileService.fileExists(this.gitignore))
      ? await this.fileService.getContents(this.gitignore)
      : '';

    const listed = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
    const missing = GENERATED.filter((entry) => !listed.has(entry));
    if (missing.length === 0) {
      return;
    }

    const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
    await this.fileService.writeContents(this.gitignore, `${existing}${separator}${missing.join('\n')}\n`);
  }
}
