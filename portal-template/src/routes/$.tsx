import { createFileRoute, getRouteApi, notFound } from '@tanstack/react-router';
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
import { canonicalLink } from '@/lib/seo';
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
    const data = await serverLoader({ data: slugs });

    if (data.type === 'docs') {
      await docs.getPage(data.path)?.preload();
    }
    return data;
  },
  head: ({ loaderData, params }) => {
    const title = loaderData && loaderData.type !== 'home' ? `${loaderData.title} | ${portal.title}` : portal.title;
    const description = loaderData?.description ?? portal.description;
    const splat = params._splat?.replace(/\/$/, '') ?? '';
    return {
      meta: [{ title }, ...(description ? [{ name: 'description', content: description }] : [])],
      links: canonicalLink(splat.length > 0 ? `/${splat}` : '/'),
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

function Content({ path, markdownUrl }: { path: string; markdownUrl: string }) {
  const page = docs.getPage(path);
  if (!page) throw new Error(`unknown page: ${path}`);

  const { toc } = use(page.load());
  const MDX = page.body;

  return (
    <DocsPage toc={toc}>
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b -mt-4 pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover markdownUrl={markdownUrl} />
      </div>
      <DocsBody>
        <MDX components={useMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

function Home({ title, description }: { title: string; description: string | null }) {
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
