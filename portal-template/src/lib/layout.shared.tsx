import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { portal } from './portal';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Logo />
          {portal.name}
        </>
      )
    },
    links: portal.links.map((link) => ({ text: link.label, url: link.url, external: link.external })),
    // A portal fixed to one mode has nothing to switch to.
    themeSwitch: { enabled: portal.colorMode === 'both' }
  };
}

// The name sits beside it, so the image itself says nothing a screen reader needs.
function Logo() {
  const { logo } = portal;
  if (!logo) return null;
  if (logo.light === logo.dark) return <img src={logo.light} alt="" className="h-6 w-auto" />;
  // Both are in the page and CSS shows one, so the right one is there before any script runs.
  return (
    <>
      <img src={logo.light} alt="" className="h-6 w-auto dark:hidden" />
      <img src={logo.dark} alt="" className="hidden h-6 w-auto dark:block" />
    </>
  );
}
