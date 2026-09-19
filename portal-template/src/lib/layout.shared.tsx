import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { portal } from './portal';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          {portal.logoUrl ? <img src={portal.logoUrl} alt="" className="h-6 w-auto" /> : null}
          {portal.title}
        </>
      ),
    },
  };
}
