import { absoluteUrl } from './seo';
import { source } from './source.server';

export function renderSitemap(): string {
  const urls = ['/', ...source.getPages().map((page) => page.url)];
  const entries = [...new Set(urls)]
    .map((url) => `  <url>\n    <loc>${escapeXml(absoluteUrl(url) ?? url)}</loc>\n  </url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
