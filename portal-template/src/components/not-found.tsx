import { useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import { baseOptions } from '@/lib/layout.shared';
import { analytics } from '@/lib/portal-analytics';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { DefaultNotFound } from 'fumadocs-ui/layouts/home/not-found';

export function NotFound() {
  const { pathname } = useLocation();
  // Keyed on the path: the same component shows the next missing page too.
  useEffect(() => analytics.reportNotFound(document.referrer), [pathname]);
  return (
    <HomeLayout {...baseOptions()}>
      <DefaultNotFound />
    </HomeLayout>
  );
}
