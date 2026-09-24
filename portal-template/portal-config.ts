import { readFile } from 'node:fs/promises';
import type { Portal } from './src/lib/portal-types';

/** Written by the CLI next to this file before every build or dev-server start. */
export interface PortalConfig {
  /** Section slug -> absolute path of an OpenAPI document. */
  specs: Record<string, string>;
  /** Absolute. Always exists, and may be empty. */
  contentDir: string;
  staticDir: string | null;
}

export async function readPortalConfig(): Promise<PortalConfig> {
  return (await readJson('./portal.config.json')) as PortalConfig;
}

/** The part of what the browser is told that the build set-up reads too. */
export type BuildIdentity = Pick<Portal, 'siteUrl'>;

export async function readPortalIdentity(): Promise<BuildIdentity> {
  return (await readJson('./portal.identity.json')) as BuildIdentity;
}

async function readJson(relative: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(relative, import.meta.url), 'utf8'));
}
