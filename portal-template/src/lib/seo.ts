import { portal } from './portal';

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

export function renderRobots(): string {
  const sitemap = absoluteUrl('/sitemap.xml');
  return ['User-agent: *', 'Allow: /', ...(sitemap === null ? [] : ['', `Sitemap: ${sitemap}`])].join('\n') + '\n';
}
