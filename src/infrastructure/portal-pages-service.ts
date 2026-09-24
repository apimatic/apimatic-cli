import { err, ok, Result } from 'neverthrow';
import { DirectoryPath } from '../types/file/directoryPath.js';
import { FileName } from '../types/file/fileName.js';
import { FilePath } from '../types/file/filePath.js';
import { GeneratedPages, PageTemplateName } from '../types/portal/generated-pages.js';
import { NAVIGATION_FILE_NAME } from '../types/portal/portal-navigation.js';
import { PageTemplate } from '../types/portal/page-template.js';
import { errorMessage } from '../utils/error-utils.js';
import { envInfo } from './env-info.js';
import { FileService } from './file-service.js';

/** Shipped beside `portal-template/`, one `.mdx` file per template. */
const TEMPLATES_DIRECTORY_NAME = 'portal-pages';

/** A file to write, with the section folder it goes in. */
interface GeneratedFile {
  folder: DirectoryPath;
  file: FilePath;
  contents: string;
}

/**
 * Writes the pages the CLI generates into a directory of the build project, rendered from the
 * templates the package ships. A file is written only when its contents change, and whatever
 * the pages no longer call for is deleted, so under `portal serve` an edit reloads only what it
 * changed; the answer says whether anything was written or deleted.
 */
export class PortalPagesService {
  private readonly fileService = new FileService();

  public async write(directory: DirectoryPath, pages: GeneratedPages): Promise<Result<boolean, string>> {
    const files = await this.render(directory, pages);
    if (files.isErr()) {
      return err(files.error);
    }
    try {
      let changed = false;
      for (const { folder, file, contents } of files.value) {
        const current = (await this.fileService.fileExists(file)) ? await this.fileService.getContents(file) : null;
        if (current !== contents) {
          await this.fileService.createDirectoryIfNotExists(folder);
          await this.fileService.writeContents(file, contents);
          changed = true;
        }
      }
      const removed = await this.removeStale(directory, files.value);
      return ok(changed || removed);
    } catch (error) {
      return err(errorMessage(error));
    }
  }

  private async render(directory: DirectoryPath, pages: GeneratedPages): Promise<Result<GeneratedFile[], string>> {
    const templates = new Map<PageTemplateName, PageTemplate>();
    const files: GeneratedFile[] = [];

    for (const page of pages.pages()) {
      let template = templates.get(page.template);
      if (template === undefined) {
        const read = await this.template(page.template);
        if (read.isErr()) {
          return err(read.error);
        }
        template = read.value;
        templates.set(page.template, template);
      }
      const rendered = template.render(page.data);
      if (rendered.isErr()) {
        return err(`A portal page template could not be filled. ${rendered.error}`);
      }
      const folder = directory.join(page.section.folder);
      files.push({ folder, file: new FilePath(folder, page.fileName), contents: rendered.value });
    }

    for (const navigation of pages.navigationFiles()) {
      const folder = directory.join(navigation.section.folder);
      files.push({
        folder,
        file: new FilePath(folder, new FileName(NAVIGATION_FILE_NAME)),
        contents: navigation.contents
      });
    }
    return ok(files);
  }

  private async template(name: PageTemplateName): Promise<Result<PageTemplate, string>> {
    const fileName = new FileName(`${name}.mdx`);
    const file = new FilePath(envInfo.packageRoot().join(TEMPLATES_DIRECTORY_NAME), fileName);
    try {
      return ok(new PageTemplate(fileName, await this.fileService.getContents(file)));
    } catch {
      return err(
        `The portal page template '${fileName}' is missing from this installation. Reinstall the CLI and try again.`
      );
    }
  }

  /** Deletes every file and folder in the directory that the pages no longer call for. */
  private async removeStale(directory: DirectoryPath, wanted: GeneratedFile[]): Promise<boolean> {
    let removed = false;

    for (const fileName of await this.fileService.getFileNames(directory)) {
      await this.fileService.deleteFile(new FilePath(directory, fileName));
      removed = true;
    }
    for (const folder of await this.fileService.getSubDirectoriesPaths(directory)) {
      const inFolder = wanted.filter((candidate) => candidate.folder.isEqual(folder));
      if (inFolder.length === 0) {
        await this.fileService.deleteDirectory(folder);
        removed = true;
        continue;
      }
      for (const fileName of await this.fileService.getFileNames(folder)) {
        const file = new FilePath(folder, fileName);
        if (!inFolder.some((candidate) => candidate.file.isEqual(file))) {
          await this.fileService.deleteFile(file);
          removed = true;
        }
      }
    }
    return removed;
  }
}
