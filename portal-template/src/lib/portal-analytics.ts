import { Analytics } from './analytics';
import { portal } from './portal';

export const analytics = new Analytics(portal.analytics);
// When the bundle starts, before React: setup entries first, then the loader. Never during prerendering.
if (typeof window !== 'undefined') analytics.start();
