import portalConfig from '../../portal.config.json';

/**
 * Section slug to the absolute path of its OpenAPI document on the machine running the build.
 * Behind `.server.` so these paths are never published to a visitor.
 */
export const specs = portalConfig.specs as Record<string, string>;
