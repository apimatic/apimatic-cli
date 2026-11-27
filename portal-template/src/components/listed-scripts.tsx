import { useEffect } from 'react';
import { analytics } from '@/lib/portal-analytics';

/** Rendered with a page's content, so its effect runs once React has hydrated the page a script may change. */
export function ListedScripts() {
  useEffect(() => {
    analytics.loadScripts();
  }, []);
  return null;
}
