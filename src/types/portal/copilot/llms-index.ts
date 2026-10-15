import { SiteAddress } from '../config/site-address.js';

/** One page `llms.txt` lists, addressed from the portal's root: `/` for the home page, `/guides/intro` for one under it. */
export interface ListedPage {
  path: string;
  title: string;
  description: string | null;
}

const LINK = /^\s*[-*]\s+\[(.*)\]\(([^)\s]+)\)(?::\s*(.*?))?\s*$/;

const DOWNLOADS = '/__downloads/';

/** The pages `llms.txt` lists under the portal's base path, each once, in the order it lists them. */
export function listedPages(llmsTxt: string, site: SiteAddress | null): ListedPage[] {
  const basePath = site?.path() ?? '/';
  const pages = new Map<string, ListedPage>();
  for (const line of llmsTxt.split(/\r?\n/)) {
    const match = LINK.exec(line);
    if (match === null) {
      continue;
    }
    const [, title, href, description] = match;
    const path = portalPath(href, basePath);
    if (path !== null && !pages.has(path)) {
      pages.set(path, { path, title: title.trim(), description: description ? description : null });
    }
  }
  return [...pages.values()];
}

function portalPath(href: string, basePath: string): string | null {
  const [address] = href.split(/[?#]/);
  if (!address.startsWith('/') || address.includes(DOWNLOADS)) {
    return null;
  }
  const withSlash = address.endsWith('/') ? address : `${address}/`;
  if (!withSlash.startsWith(basePath)) {
    return null;
  }
  const segments = withSlash
    .slice(basePath.length)
    .split('/')
    .filter((segment) => segment !== '');
  // A segment that climbs would name a file outside the portal.
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return null;
  }
  return `/${segments.join('/')}`;
}
