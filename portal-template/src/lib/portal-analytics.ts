import { analyticsFor } from './analytics';
import { portal } from './portal';

const analytics = analyticsFor(portal.analytics);
// When the bundle starts, before React: setup entries first, then the loader. Never during prerendering.
if (typeof window !== 'undefined') analytics.startAnalytics();

export const { insertWhenClean, reportPageViews } = analytics;
