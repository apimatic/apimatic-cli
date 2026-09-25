import path from 'node:path';
import { execa } from 'execa';
import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { SHELL_FILE_NAME } from '../types/portal-context.js';
import { FileService } from './file-service.js';
import { CONTENT_COPY_DIRECTORY_NAME, PortalProjectPaths, PortalProjectService } from './portal-project-service.js';

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

export class PortalBuildService {
  private readonly fileService = new FileService();
  private readonly projectService = new PortalProjectService();

  public async build(
    project: PortalProjectPaths,
    contentSource: DirectoryPath | null
  ): Promise<Result<PortalBuildResult, PortalBuildFailure>> {
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

    const log = contentSource === null ? result.all ?? '' : namingSource(result.all ?? '', project, contentSource);
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
      const isPage = (file: FilePath) => file.name().hasExtension('.html') && !file.name().is(SHELL_FILE_NAME);
      return directory.getAllFiles().filter(isPage).length;
    } catch {
      return null;
    }
  }
}

// The build reads a copy of the pages, in a temporary directory; a reader knows each page by its place in the source.
function namingSource(log: string, project: PortalProjectPaths, contentSource: DirectoryPath): string {
  const spellings = (directory: DirectoryPath) => [
    directory.toString(),
    directory.toString().split(path.sep).join('/')
  ];
  const [copy, copyPosix] = spellings(project.projectDirectory.join(CONTENT_COPY_DIRECTORY_NAME));
  const [source, sourcePosix] = spellings(contentSource);
  return log.replaceAll(copy, source).replaceAll(copyPosix, sourcePosix);
}
