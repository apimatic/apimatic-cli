import { createFileRoute, getRouteApi, isNotFound, isRedirect, notFound } from '@tanstack/react-router';
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { createServerFn } from '@tanstack/react-start';
import { docs } from '@/lib/source';
import { source } from '@/lib/source.server';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/notebook/page';
import { baseOptions } from '@/lib/layout.shared';
import { getPageMarkdownUrl } from '@/lib/shared';
import { portal } from '@/lib/portal';
import { absoluteUrl, canonicalLink } from '@/lib/seo';
import { useFumadocsLoader } from 'fumadocs-core/source/client';
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions';
import { Suspense, use, type ReactNode } from 'react';
import { useMDXComponents } from '@/components/mdx';
import { OpenAPIPage } from '@/components/api-page';
import { slimOpenAPIPageProps } from '@/lib/openapi-slim';

const rootRoute = getRouteApi('__root__');

export const Route = createFileRoute('/$')({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split('/').filter((segment) => segment.length > 0) ?? [];
    const data = await loadPage(slugs);

    if (data.type === 'docs') {
      await docs.getPage(data.path)?.preload();
    }
    return data;
  },
  head: ({ loaderData, params }) => {
    const title = loaderData && loaderData.type !== 'home' ? `${loaderData.title} | ${portal.title}` : portal.title;
    const description = loaderData?.description ?? portal.description;
    const splat = params._splat?.replace(/\/$/, '') ?? '';
    const pageUrl = splat.length > 0 ? `/${splat}` : '/';
    const absolute = absoluteUrl(pageUrl);
    return {
      // Without the og:* pair, pasting a documentation link into Slack, Teams or LinkedIn
      // produced a bare URL. They are built from the values the page already computed.
      meta: [
        { title },
        ...(description ? [{ name: 'description', content: description }] : []),
        { property: 'og:title', content: title },
        ...(description ? [{ property: 'og:description', content: description }] : []),
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: portal.title },
        ...(absolute ? [{ property: 'og:url', content: absolute }] : []),
        { name: 'twitter:card', content: 'summary' },
      ],
      links: canonicalLink(pageUrl),
    };
  },
});

const serverLoader = createServerFn({
  method: 'GET',
})
  .validator((slugs: string[]) => slugs)
  .middleware([staticFunctionMiddleware])
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);

    if (!page) {
      // A project without content/index.md(x) still gets a landing page.
      if (slugs.length === 0) {
        return { type: 'home' as const, title: portal.title, description: portal.description };
      }
      throw notFound();
    }

    if (page.type !== 'docs') {
      return {
        type: 'openapi' as const,
        title: page.data.title,
        description: page.data.description ?? null,
        props: slimOpenAPIPageProps(page.data.getOpenAPIPageProps()),
      };
    }

    return {
      type: 'docs' as const,
      title: page.data.title,
      description: page.data.description ?? null,
      path: page.path,
      markdownUrl: getPageMarkdownUrl(page).url,
    };
  });

// The condition `staticFunctionMiddleware` itself uses to answer from the prerendered cache
// instead of calling the handler.
const answeredFromStaticCache = process.env.NODE_ENV === 'production' && typeof document !== 'undefined';

/**
 * An unknown URL has no prerendered response, and the middleware fetches one without checking
 * the status: it parses whatever the host returns for a missing file, so `.json()` throws
 * before the router can act on the `notFound()` the handler would have raised, and the error
 * boundary renders in place of the not-found page. Only the cache path is rewritten — where
 * the handler never runs, a failed fetch can only mean the page does not exist. Everywhere
 * else, including the prerender pass and `portal serve`, a real failure still surfaces.
 */
async function loadPage(slugs: string[]) {
  try {
    return await serverLoader({ data: slugs });
  } catch (error) {
    if (!answeredFromStaticCache || isNotFound(error) || isRedirect(error)) throw error;
    // A missing page is the ordinary reason to land here, but not the only one: a network
    // failure, or a host answering with its own error page, fails the same way. Rendering
    // "not found" for those is the better of two bad pages, and saying what actually
    // happened is the difference between a puzzle and a report a user can act on.
    console.error('Falling back to the not-found page; loading this page failed with:', error);
    throw notFound();
  }
}

function Content({ path, markdownUrl }: Readonly<{ path: string; markdownUrl: string }>) {
  const page = docs.getPage(path);
  if (!page) throw new Error(`unknown page: ${path}`);

  const { toc } = use(page.load());
  const PageBody = page.body;

  return (
    <DocsPage toc={toc}>
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b -mt-4 pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        {/* Sends the reader to an external AI vendor, so a portal published under someone
            else's brand can turn it off. */}
        {portal.aiPageActions ? <ViewOptionsPopover markdownUrl={markdownUrl} /> : null}
      </div>
      <DocsBody>
        <PageBody components={useMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

function Home({ title, description }: Readonly<{ title: string; description: string | null }>) {
  return (
    <DocsPage>
      <DocsTitle>{title}</DocsTitle>
      {description ? <DocsDescription>{description}</DocsDescription> : null}
      <DocsBody>
        <p>Use the navigation to browse the API reference and guides.</p>
      </DocsBody>
    </DocsPage>
  );
}

function Page() {
  const page = useFumadocsLoader(Route.useLoaderData());
  const { pageTree } = useFumadocsLoader(rootRoute.useLoaderData());
  let content: ReactNode;

  if (page.type === 'home') {
    content = <Home title={page.title} description={page.description} />;
  } else if (page.type === 'openapi') {
    content = (
      <DocsPage full>
        <DocsTitle>{page.title}</DocsTitle>
        <DocsDescription>{page.description}</DocsDescription>
        <DocsBody>
          <OpenAPIPage {...page.props} />
        </DocsBody>
      </DocsPage>
    );
  } else {
    content = (
      <Suspense>
        <Content path={page.path} markdownUrl={page.markdownUrl} />
      </Suspense>
    );
  }

  const base = baseOptions();
  return (
    <DocsLayout {...base} nav={{ ...base.nav, mode: 'top' }} tree={pageTree}>
      {content}
    </DocsLayout>
  );
}
