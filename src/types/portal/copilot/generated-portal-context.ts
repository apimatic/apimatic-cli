import { FileService } from '../../../infrastructure/file-service.js';
import { DirectoryPath } from '../../file/directoryPath.js';
import { FileName } from '../../file/fileName.js';
import { FilePath } from '../../file/filePath.js';
import { SiteAddress } from '../config/site-address.js';
import { BundlePage, CopilotBundle } from './copilot-bundle.js';
import { ListedPage, listedPages } from './llms-index.js';

/** A portal `portal generate` wrote, read for the pages Ask AI answers from. */
export class GeneratedPortalContext {
  private readonly fileService = new FileService();

  constructor(private readonly portalDirectory: DirectoryPath) {}

  private get index(): FilePath {
    return new FilePath(this.portalDirectory, new FileName('llms.txt'));
  }

  /** Null when the directory holds no generated portal. A listed page without its Markdown twin is left out. */
  public async bundle(site: SiteAddress | null, cliVersion: string, at: Date): Promise<CopilotBundle | null> {
    if (!(await this.fileService.fileExists(this.index))) {
      return null;
    }
    const listed = listedPages(await this.fileService.getContents(this.index), site);
    const pages: BundlePage[] = [];
    for (const page of listed) {
      const markdown = this.markdownOf(page);
      if (await this.fileService.fileExists(markdown)) {
        pages.push({ ...page, markdown: await this.fileService.getContents(markdown) });
      }
    }
    return CopilotBundle.of(pages, site, cliVersion, at);
  }

  private markdownOf({ path }: ListedPage): FilePath {
    if (path === '/') {
      return new FilePath(this.portalDirectory, new FileName('index.md'));
    }
    const segments = path.slice(1).split('/');
    const page = segments.pop()!;
    return new FilePath(this.portalDirectory.join(...segments), new FileName(`${page}.md`));
  }
}
