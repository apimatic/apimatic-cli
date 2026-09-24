import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions';
import { source } from '@/lib/source.server';
import appCss from '@/styles/app.css?url';
import { RootProvider } from 'fumadocs-ui/provider/tanstack';
import SearchDialog from '@/components/search';
import { portal } from '@/lib/portal';

// The sidebar tree is the same on every page. Loaded here, once, it is written to a single
// cache file instead of being repeated in every page's own loader payload.
const loadPageTree = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .handler(async () => ({ pageTree: await source.serializePageTree(source.getPageTree()) }));

// Linked from the page rather than imported by `app.css`, so the browser fetches it alongside the
// stylesheet instead of after it.
const fontLinks = [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' as const },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap'
  }
];

// Without one the browser tab shows the blank-document icon on every page.
const iconLinks = portal.favicon
  ? [{ rel: 'icon', href: portal.favicon.url, ...(portal.favicon.type ? { type: portal.favicon.type } : {}) }]
  : [];

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
      ...(portal.description ? [{ name: 'description', content: portal.description }] : [])
    ],
    links: [...fontLinks, { rel: 'stylesheet', href: appCss }, ...iconLinks]
  }),
  component: RootComponent
});

function RootComponent() {
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
