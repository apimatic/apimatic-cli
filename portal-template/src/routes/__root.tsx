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

export const Route = createRootRoute({
  loader: () => loadPageTree(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: portal.title },
      ...(portal.description ? [{ name: 'description', content: portal.description }] : [])
    ],
    // The portal already supplies a logo for the navigation bar; without this the browser
    // tab showed the blank-document icon on every page.
    links: [{ rel: 'stylesheet', href: appCss }, ...(portal.logoUrl ? [{ rel: 'icon', href: portal.logoUrl }] : [])]
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
        <RootProvider search={{ SearchDialog }}>
          <Outlet />
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
