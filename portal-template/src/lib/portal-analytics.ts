import { Analytics } from './analytics';
import { portal } from './portal';
import { markPlaygroundDialogs } from './replay-markers';

export const analytics = new Analytics(portal.analytics);
// When the bundle starts, before React and before any vendor tag. Never during prerendering.
if (typeof window !== 'undefined') {
  markPlaygroundDialogs();
  analytics.start();
}
