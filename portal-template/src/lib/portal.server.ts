import portalConfig from '../../portal.config.json';

/**
 * Section slug to the absolute path of its OpenAPI document on the machine running the
 * build. Behind `.server.` so TanStack's import protection fails the build if client code
 * reaches for it, rather than publishing those paths to every visitor.
 */
export const specs = portalConfig.specs as Record<string, string>;
