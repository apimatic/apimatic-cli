import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { isJsonObject } from '../../../utils/json-utils.js';
import { SiteAddress } from '../config/site-address.js';

/** A page as Ask AI reads it: its portal-relative path, as the chat links it, and its Markdown. */
export interface BundlePage {
  path: string;
  title: string;
  description: string | null;
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

// The service refuses a bundle with a longer title or description. An operation's description can be a whole guide,
// but its page's Markdown carries it in full, so cutting the field loses nothing Ask AI reads.
const TITLE_LIMIT = 500;
const DESCRIPTION_LIMIT = 5000;

/** The portal's pages as the Ask AI service ingests them, in its format version 1. */
export class CopilotBundle {
  private constructor(
    private readonly document: BundleDocument,
    private readonly json: string = JSON.stringify(document)
  ) {}

  /** A bundle `generate` wrote, kept as its exact bytes; null for one this CLI cannot read. */
  public static parse(json: string): CopilotBundle | null {
    let document: unknown;
    try {
      document = JSON.parse(json);
    } catch {
      return null;
    }
    return isBundleDocument(document) ? new CopilotBundle(document, json) : null;
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
        title: cap(title, TITLE_LIMIT),
        ...(description === null ? {} : { description: cap(description, DESCRIPTION_LIMIT) }),
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

  /** Names these exact bytes: the service checks a deployed bundle.json against it, so it never indexes half a deploy. */
  public buildManifest(): string {
    return JSON.stringify({ formatVersion: 1, buildId: createHash('sha256').update(this.json).digest('hex') });
  }
}

/** A page as the portal's build writes it for Ask AI; null for anything else. */
export function bundlePageOf(value: unknown): BundlePage | null {
  if (!isJsonObject(value)) return null;
  const { path, title, description, markdown } = value;
  if (typeof path !== 'string' || typeof title !== 'string' || typeof markdown !== 'string') return null;
  if (description !== null && typeof description !== 'string') return null;
  return { path, title, description, markdown };
}

// Cuts on a word boundary when one is near enough the limit, so the field does not end mid-word.
function cap(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  const cut = value.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit - 40 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

function isBundleDocument(value: unknown): value is BundleDocument {
  return (
    isJsonObject(value) &&
    value.formatVersion === 1 &&
    isJsonObject(value.generator) &&
    typeof value.generatedAt === 'string' &&
    (value.siteUrl === null || typeof value.siteUrl === 'string') &&
    typeof value.basePath === 'string' &&
    Array.isArray(value.pages) &&
    // A page without a description leaves the key out.
    value.pages.every((page) => isJsonObject(page) && bundlePageOf({ description: null, ...page }) !== null)
  );
}
