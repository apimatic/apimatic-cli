import { useEffect } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { baseOptions } from '@/lib/layout.shared';
import { analytics } from '@/lib/portal-analytics';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { DefaultNotFound } from 'fumadocs-ui/layouts/home/not-found';
import { ListedScripts } from './listed-scripts';

export function NotFound() {
  // The path the router has settled on: its location alone already names the page a reader is leaving this one for.
  const settled = useRouterState({
    select: ({ location, resolvedLocation }) =>
      resolvedLocation?.pathname === location.pathname ? location.pathname : null
  });
  // Keyed on the path: the same component shows the next missing page too.
  useEffect(() => {
    if (settled !== null) analytics.reportNotFound();
  }, [settled]);
  return (
    <HomeLayout {...baseOptions()}>
      <DefaultNotFound />
      <ListedScripts />
    </HomeLayout>
  );
}
