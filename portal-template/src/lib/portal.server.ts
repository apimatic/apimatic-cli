import portalConfig from '../../portal.config.json';
import type { BuildPaths } from '../../portal-config';

const paths = portalConfig as BuildPaths;

/**
 * Section slug to the absolute path of its OpenAPI document on the machine running the build.
 * Behind `.server.` so these paths are never published to a visitor.
 */
export const specs = paths.specs;

/** The code samples the CLI placed beside `portal.config.json`, or null for a build without any. */
export const codeSamplesFile = paths.codeSamples;
