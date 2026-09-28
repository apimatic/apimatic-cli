import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { portal } from './portal';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Logo />
          {/* 45vw is the widest that leaves the rest of the header room at every width from 320px. */}
          <span className="max-w-[45vw] truncate">{portal.name}</span>
        </>
      )
    },
    // From lg the header holds these to a share of its row, where a label of two or more words would wrap.
    links: portal.links.map((link) => ({
      text: <span className="lg:text-nowrap">{link.label}</span>,
      url: link.url,
      external: link.external
    })),
    // A portal fixed to one mode has nothing to switch to.
    themeSwitch: { enabled: portal.colorMode === 'both' }
  };
}

// Without max-w-none, Tailwind's image reset lets the header size the title as if the logo had no width.
const LOGO_SIZE = 'h-6 w-auto max-w-none';

// The name sits beside it, so the image itself says nothing a screen reader needs.
function Logo() {
  const { logo } = portal;
  if (!logo) return null;
  if (logo.light === logo.dark) return <img src={logo.light} alt="" className={LOGO_SIZE} />;
  // Both are in the page and CSS shows one, so the right one is there before any script runs.
  return (
    <>
      <img src={logo.light} alt="" className={`${LOGO_SIZE} dark:hidden`} />
      <img src={logo.dark} alt="" className={`hidden ${LOGO_SIZE} dark:block`} />
    </>
  );
}
