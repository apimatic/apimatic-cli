import { asciiUpperCase } from '../text/ascii.js';

/** The mock's own API answers under this prefix before any stub, so a stub path there could never answer. */
export const ADMIN_PREFIX = '/__admin';

/** In any letter case: refusing more spellings than the admin API answers costs nothing, and a stub is never half hidden. */
export function isUnderAdminPrefix(path: string): boolean {
  const folded = asciiUpperCase(path);
  const prefix = asciiUpperCase(ADMIN_PREFIX);
  return folded === prefix || folded.startsWith(`${prefix}/`);
}
