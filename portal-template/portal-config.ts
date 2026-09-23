import { readFile } from 'node:fs/promises';

/** How the reference pages are grouped, and which operations they leave out. */
export interface ApiOptions {
  groupBy: 'tag' | 'route' | 'none';
  showDeprecated: boolean;
  /** Whether operations marked `x-internal: true` are documented. */
  showInternal: boolean;
}

/** Written by the CLI next to this file before every build or dev-server start. */
export interface PortalConfig {
  /** Section slug -> absolute path of an OpenAPI document. */
  specs: Record<string, string>;
  /** Absolute. Always exists, and may be empty. */
  contentDir: string;
  staticDir: string | null;
  api: ApiOptions;
}

export async function readPortalConfig(): Promise<PortalConfig> {
  return (await readJson('./portal.config.json')) as PortalConfig;
}

/**
 * The part of what the browser is told that the build set-up reads too. Declared here rather
 * than taken from `src/lib/portal.ts`, which imports the file itself and so type-checks only
 * in a prepared project.
 */
export interface BuildIdentity {
  /** Origin only, with no trailing slash. */
  siteUrl: string | null;
}

export async function readPortalIdentity(): Promise<BuildIdentity> {
  return (await readJson('./portal.identity.json')) as BuildIdentity;
}

async function readJson(relative: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(relative, import.meta.url), 'utf8'));
}
