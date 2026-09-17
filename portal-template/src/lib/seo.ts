import { portal } from './portal';
import { source } from './source';

/**
 * Absolute URL of a page, or null when the portal has no configured address.
 * Canonical links and the sitemap are both omitted in that case rather than
 * guessed, since a wrong canonical is worse than none.
 */
export function absoluteUrl(pageUrl: string): string | null {
  if (!portal.siteUrl) return null;
  return portal.siteUrl + pageUrl;
}

export function canonicalLink(pageUrl: string): { rel: string; href: string }[] {
  const href = absoluteUrl(pageUrl);
  return href === null ? [] : [{ rel: 'canonical', href }];
}

export function renderSitemap(): string {
  const urls = ['/', ...source.getPages().map((page) => page.url)];
  const entries = [...new Set(urls)]
    .map((url) => `  <url>\n    <loc>${escapeXml(absoluteUrl(url) ?? url)}</loc>\n  </url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export function renderRobots(): string {
  const sitemap = absoluteUrl('/sitemap.xml');
  return ['User-agent: *', 'Allow: /', ...(sitemap === null ? [] : ['', `Sitemap: ${sitemap}`])].join('\n') + '\n';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
