import portalConfig from '../../portal.config.json';
import type { ApiOptions } from '../../portal-config';

/**
 * Section slug to the absolute path of its OpenAPI document on the machine running the build.
 * Behind `.server.` so these paths are never published to a visitor.
 */
export const specs = portalConfig.specs as Record<string, string>;

/** How the reference pages are grouped, and which operations they leave out. */
export const api = portalConfig.api as ApiOptions;
