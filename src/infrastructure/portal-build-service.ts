import { execa } from 'execa';
import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { FileService } from './file-service.js';
import { PortalProjectPaths, PortalProjectService } from './portal-project-service.js';

export interface PortalBuildFailure {
  message: string;
  /** Combined output of the build, written next to the portal so it can be reported. */
  log: string;
}

export interface PortalBuildResult {
  /** Directory holding the finished static site. */
  output: DirectoryPath;
  pageCount: number;
}

/** The SPA shell is emitted even when nothing else is; on its own it means a failed build. */
const SHELL_FILE = '_shell.html';

export class PortalBuildService {
  private readonly fileService = new FileService();
  private readonly projectService = new PortalProjectService();

  public async build(project: PortalProjectPaths): Promise<Result<PortalBuildResult, PortalBuildFailure>> {
    const distDirectory = project.projectDirectory.join('dist');
    await this.fileService.deleteDirectory(distDirectory);

    // Run in a child process so a build crash or out-of-memory cannot take the CLI with it.
    const result = await execa(process.execPath, [project.viteBinary.toString(), 'build'], {
      cwd: project.projectDirectory.toString(),
      env: this.projectService.childEnvironment(),
      extendEnv: false,
      all: true,
      reject: false
    });

    const log = result.all ?? '';
    if (result.exitCode !== 0) {
      return err({ message: 'The portal build failed.', log });
    }

    const output = distDirectory.join('client');
    if (!(await this.fileService.fileExists(new FilePath(output, new FileName('index.html'))))) {
      return err({ message: 'The portal build produced no home page.', log });
    }

    const pageCount = await this.countPages(output);
    if (pageCount === null) {
      return err({ message: 'The portal build output could not be read.', log });
    }
    if (pageCount === 0) {
      return err({ message: 'The portal build produced no pages.', log });
    }

    return ok({ output, pageCount });
  }

  private async countPages(output: DirectoryPath): Promise<number | null> {
    try {
      const directory = await this.fileService.getDirectory(output);
      const isPage = (file: FilePath) => file.name().hasExtension('.html') && !file.name().is(SHELL_FILE);
      return directory.getAllFiles().filter(isPage).length;
    } catch {
      return null;
    }
  }
}
