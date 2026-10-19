import { err, ok, Result } from 'neverthrow';
import { FileService } from '../../../infrastructure/file-service.js';
import { DirectoryPath } from '../../file/directoryPath.js';
import { FileName } from '../../file/fileName.js';
import { FilePath } from '../../file/filePath.js';
import { BundlePage, bundlePageOf, CopilotBundle } from './copilot-bundle.js';
import { errorMessage } from '../../../utils/error-utils.js';

/** Where the deployed portal serves its bundle, under the site's address, for the Ask AI service to fetch. */
export const COPILOT_DIRECTORY_NAME = '__copilot';

// Under `/api/`, where the portal's own routes are files with extensions and no page can collide with them.
const PAGES_DIRECTORY_NAME = 'api';
const PAGES_FILE_NAME = 'copilot-pages.json';

/** Where a build of a portal with Ask AI writes its pages, for `generate` to bundle. Never deployed. */
export const COPILOT_PAGES_FILE = `${PAGES_DIRECTORY_NAME}/${PAGES_FILE_NAME}`;

/** A portal `portal generate` built or wrote, for the pages Ask AI answers from. */
export class GeneratedPortalContext {
  private readonly fileService = new FileService();

  constructor(private readonly portalDirectory: DirectoryPath) {}

  private get pagesFile(): FilePath {
    return new FilePath(this.portalDirectory.join(PAGES_DIRECTORY_NAME), new FileName(PAGES_FILE_NAME));
  }

  private get directory(): DirectoryPath {
    return this.portalDirectory.join(COPILOT_DIRECTORY_NAME);
  }

  private get bundleFile(): FilePath {
    return new FilePath(this.directory, new FileName('bundle.json'));
  }

  /**
   * The pages a build wrote for Ask AI, removing their file so it is not deployed; null for a build
   * that wrote none, as one of a portal without Ask AI.
   */
  public async takePages(): Promise<Result<BundlePage[] | null, string>> {
    const file = this.pagesFile;
    try {
      if (!(await this.fileService.fileExists(file))) {
        return ok(null);
      }
      const contents = await this.fileService.getContents(file);
      await this.fileService.deleteFile(file);
      const pages = pagesOf(contents);
      return pages === null ? err('the pages the build wrote could not be read') : ok(pages);
    } catch (error) {
      return err(errorMessage(error));
    }
  }

  /** Writes the bundle into the portal, so it is deployed with the pages it holds. */
  public async publish(bundle: CopilotBundle): Promise<Result<void, string>> {
    try {
      await this.fileService.createDirectoryIfNotExists(this.directory);
      await this.fileService.writeContents(this.bundleFile, bundle.toJson());
      await this.fileService.writeContents(
        new FilePath(this.directory, new FileName('build.json')),
        bundle.buildManifest()
      );
      return ok(undefined);
    } catch (error) {
      return err(errorMessage(error));
    }
  }

  /** The bundle `generate` published into the portal; null for a portal without one. */
  public async bundle(): Promise<Result<CopilotBundle | null, string>> {
    try {
      if (!(await this.fileService.fileExists(this.bundleFile))) {
        return ok(null);
      }
      const bundle = CopilotBundle.parse(await this.fileService.getContents(this.bundleFile));
      return bundle === null ? err('its Ask AI pages could not be read') : ok(bundle);
    } catch (error) {
      return err(errorMessage(error));
    }
  }
}

function pagesOf(contents: string): BundlePage[] | null {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;
  const pages = value.map(bundlePageOf);
  return pages.every((page) => page !== null) ? pages : null;
}
