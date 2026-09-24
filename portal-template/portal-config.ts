import { readFile } from 'node:fs/promises';
import type { Portal } from './src/lib/portal.ts';

/** Written by the CLI next to this file before every build or dev-server start. */
export interface PortalConfig extends Portal {
  /** Section slug -> absolute path of an OpenAPI document. */
  specs: Record<string, string>;
  /** Absolute path of the code samples, keyed by path then method; null when there are none. */
  codeSamples: string | null;
  /** Absolute. Always exists, and may be empty. */
  contentDir: string;
  staticDir: string | null;
}

export async function readPortalConfig(): Promise<PortalConfig> {
  const raw = await readFile(new URL('./portal.config.json', import.meta.url), 'utf8');
  return JSON.parse(raw) as PortalConfig;
}
