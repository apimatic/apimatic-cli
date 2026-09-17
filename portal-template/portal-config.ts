import { readFile } from 'node:fs/promises';

/** Written by the CLI next to this file before every build or dev-server start. */
export interface PortalConfig {
  title: string;
  description: string | null;
  /** Site-relative URL of the logo inside the static directory, or null. */
  logoUrl: string | null;
  /** Origin the portal is hosted at (no trailing slash), or null when unknown. */
  siteUrl: string | null;
  /** Section slug -> absolute path of an OpenAPI document. */
  specs: Record<string, string>;
  /** Absolute path of the content directory (always exists, may be empty). */
  contentDir: string;
  /** Absolute path of the static directory, or null when the project has none. */
  staticDir: string | null;
}

export async function readPortalConfig(): Promise<PortalConfig> {
  const raw = await readFile(new URL('./portal.config.json', import.meta.url), 'utf8');
  return JSON.parse(raw) as PortalConfig;
}
