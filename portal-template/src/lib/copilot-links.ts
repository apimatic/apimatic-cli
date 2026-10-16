import { withBasePath } from './base-path';

interface FoundPages {
  output?: { doc?: { url: string } | null }[];
}

/**
 * The service links pages by their path within the portal; the host serves them under the base
 * path. A full address already says where it is, so it is left alone.
 */
export function servedUrl(url: string, base?: string): string {
  return url.startsWith('/') && !url.startsWith('//') ? withBasePath(url, base) : url;
}

/** The numbered source chips, linked where the host serves each page. */
export function servedSources<T extends { url: string }>(sources: readonly T[], base?: string): T[] {
  return sources.map((source) => ({ ...source, url: servedUrl(source.url, base) }));
}

/** A search's found pages, linked where the host serves each one. */
export function servedSearch<T extends FoundPages>(part: T, base?: string): T {
  return {
    ...part,
    output: part.output?.map((found) => ({
      ...found,
      doc: found.doc && { ...found.doc, url: servedUrl(found.doc.url, base) }
    }))
  };
}
