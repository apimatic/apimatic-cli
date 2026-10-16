import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
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
  private readonly json: string;

  private constructor(private readonly document: BundleDocument) {
    this.json = JSON.stringify(document);
  }

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
    return gzipSync(this.json);
  }

  /** As the deployed portal serves it for the Ask AI service to fetch: plain, since hosts compress it themselves. */
  public toJson(): string {
    return this.json;
  }

  /** Names these exact bytes, so the Ask AI service fetches the bundle only when a deploy changed it. */
  public buildManifest(): string {
    return JSON.stringify({ formatVersion: 1, buildId: createHash('sha256').update(this.json).digest('hex') });
  }
}
