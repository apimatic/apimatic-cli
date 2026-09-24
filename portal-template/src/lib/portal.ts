import identity from '../../portal.identity.json';
import type { Portal } from './portal-types';

// The CLI writes `portal.identity.json` when it prepares the build, and rewrites it when the
// `portal` block changes under `portal serve`.
//
// This module is imported by the browser bundle, and a retained JSON module is not tree-shaken
// per property, so the file holds these fields and nothing else: importing `portal.config.json`
// here would publish the build machine's absolute paths to every visitor. Those live in
// `portal.server.ts`.
export const portal = identity as Portal;
