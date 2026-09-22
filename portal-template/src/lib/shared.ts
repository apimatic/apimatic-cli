import { createGetUrl } from 'fumadocs-core/source';

export const docsRoute = '/';

/**
 * Where the reference pages of every specification are mounted, one folder per section
 * beneath it. Shared so the navigation transformer positions the same folder the OpenAPI
 * sections are written into.
 */
export const apiBaseDir = 'api';

const getDocsUrl = createGetUrl(docsRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs];
  if (segments.length === 0) {
    segments.push('index.md');
  } else {
    segments[segments.length - 1] += '.md';
  }

  return { segments, url: getDocsUrl(segments, page.locale) };
}

/** @returns page slugs */
export function decodeMarkdownUrl(segments: string[]) {
  if (segments.length === 0) return [];

  const out = [...segments];
  out[out.length - 1] = (out.at(-1) ?? '').replace(/\.md$/, '');
  if (out.length === 1 && out[0] === 'index') out.pop();
  return out;
}
