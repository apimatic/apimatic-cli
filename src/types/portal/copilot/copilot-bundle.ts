import { Buffer } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import { SiteAddress } from '../config/site-address.js';
import { ListedPage } from './llms-index.js';

export interface BundlePage extends ListedPage {
  markdown: string;
}

interface BundleDocument {
  formatVersion: 1;
  generator: { name: string; version: string };
  generatedAt: string;
  siteUrl: string | null;
  basePath: string;
  pages: {
    path: string;
    title: string;
    description?: string;
    markdown: string;
  }[];
}

const GENERATOR_NAME = 'apimatic-cli';

/** The portal's pages as the Ask AI service ingests them, in its format version 1. */
export class CopilotBundle {
  private constructor(private readonly document: BundleDocument) {}

  public static of(pages: BundlePage[], site: SiteAddress | null, cliVersion: string, at: Date): CopilotBundle {
    return new CopilotBundle({
      formatVersion: 1,
      generator: { name: GENERATOR_NAME, version: cliVersion },
      generatedAt: at.toISOString(),
      siteUrl: site === null ? null : site.toString(),
      basePath: site?.path() ?? '/',
      pages: pages.map(({ path, title, description, markdown }) => ({
        path,
        title,
        ...(description === null ? {} : { description }),
        markdown
      }))
    });
  }

  public pageCount(): number {
    return this.document.pages.length;
  }

  public gzipped(): Buffer {
    return gzipSync(JSON.stringify(this.document));
  }

  public toJSON(): BundleDocument {
    return this.document;
  }
}
