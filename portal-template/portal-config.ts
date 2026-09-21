import { readFile } from 'node:fs/promises';

/** Written by the CLI next to this file before every build or dev-server start. */
export interface PortalConfig {
  title: string;
  description: string | null;
  /** Site-relative, and inside the static directory. */
  logoUrl: string | null;
  /** Origin only, with no trailing slash. */
  siteUrl: string | null;
  /** Whether each page offers to open itself in an AI assistant. */
  aiPageActions: boolean;
  /** Section slug -> absolute path of an OpenAPI document. */
  specs: Record<string, string>;
  /** Absolute. Always exists, and may be empty. */
  contentDir: string;
  staticDir: string | null;
}

export async function readPortalConfig(): Promise<PortalConfig> {
  const raw = await readFile(new URL('./portal.config.json', import.meta.url), 'utf8');
  return JSON.parse(raw) as PortalConfig;
}
