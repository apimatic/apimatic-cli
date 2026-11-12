import { useEffect } from 'react';
import { baseOptions } from '@/lib/layout.shared';
import { analytics } from '@/lib/portal-analytics';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { DefaultNotFound } from 'fumadocs-ui/layouts/home/not-found';

export function NotFound() {
  useEffect(() => analytics.reportNotFound(document.referrer), []);
  return (
    <HomeLayout {...baseOptions()}>
      <DefaultNotFound />
    </HomeLayout>
  );
}
