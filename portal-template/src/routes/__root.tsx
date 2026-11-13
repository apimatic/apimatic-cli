import { createRootRoute, HeadContent, Outlet, Scripts, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useEffect } from 'react';
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions';
import { source } from '@/lib/source.server';
import appCss from '@/styles/app.css?url';
import { RootProvider } from 'fumadocs-ui/provider/tanstack';
import SearchDialog from '@/components/search';
import { withBasePath } from '@/lib/base-path';
import { portal } from '@/lib/portal';
import { analytics } from '@/lib/portal-analytics';

// The sidebar tree is the same on every page. Loaded here, once, it is written to a single
// cache file instead of being repeated in every page's own loader payload.
const loadPageTree = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .handler(async () => ({ pageTree: await source.serializePageTree(source.getPageTree()) }));

// Without one the browser tab shows the blank-document icon on every page.
const iconLinks = portal.favicon
  ? [
      {
        rel: 'icon',
        href: withBasePath(portal.favicon.url),
        ...(portal.favicon.type ? { type: portal.favicon.type } : {})
      }
    ]
  : [];

// Fumadocs' copy button has no callback of its own, so the document hears every click.
const reportCodeCopy = (event: MouseEvent) => analytics.reportCodeCopy(event.target);

// A portal fixed to one mode keeps to it whatever the visitor's system prefers, and offers no
// way out: the layout hides the switch, and the `D` hotkey is turned off here.
const theme =
  portal.colorMode === 'both'
    ? undefined
    : { forcedTheme: portal.colorMode, defaultTheme: portal.colorMode, enableSystem: false, hotKey: false as const };

export const Route = createRootRoute({
  loader: () => loadPageTree(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: portal.name },
      ...(portal.description ? [{ name: 'description', content: portal.description }] : []),
      ...(portal.seo.googleSiteVerification
        ? [{ name: 'google-site-verification', content: portal.seo.googleSiteVerification }]
        : [])
    ],
    links: [{ rel: 'stylesheet', href: appCss }, ...iconLinks]
  }),
  component: RootComponent
});

function RootComponent() {
  const router = useRouter();
  useEffect(() => {
    // A prerendered page mounts with the router idle and raises no `onRendered` for its first page, so it
    // is reported here; `portal serve` mounts pending, before the page's head applies, and `onRendered` follows.
    if (router.state.status === 'idle') analytics.reportPageView();
    const unsubscribe = router.subscribe('onRendered', () => analytics.reportPageView());
    document.addEventListener('click', reportCodeCopy);
    return () => {
      unsubscribe();
      document.removeEventListener('click', reportCodeCopy);
    };
  }, [router]);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex flex-col min-h-screen">
        <RootProvider search={{ SearchDialog }} theme={theme}>
          <Outlet />
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
