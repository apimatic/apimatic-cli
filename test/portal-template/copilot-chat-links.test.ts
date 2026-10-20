import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect } from 'chai';

// `copilot.tsx` passes the service's paths through unchanged: right only while the router adds the base, once.
describe("the Ask AI chat's links under a base", () => {
  it('links a source by its path within the portal, served under the base once', async () => {
    // Their ES module builds: the CommonJS ones warn of a circular require when loaded.
    const { createMemoryHistory, createRootRoute, createRouter, RouterProvider } = await import(
      '@tanstack/react-router'
    );
    const { TanstackProvider } = await import('fumadocs-core/framework/tanstack');
    const { AIChatSources } = await import('@fumadocs/ai-chat');
    const sources = [
      { url: '/guides/intro', title: 'Intro' },
      { url: 'https://status.example.com', title: 'Status' }
    ];
    const root = createRootRoute({
      component: () => createElement(TanstackProvider, null, createElement(AIChatSources, { sources }))
    });
    const router = createRouter({
      routeTree: root,
      basepath: '/docs',
      history: createMemoryHistory({ initialEntries: ['/docs/'] })
    });
    await router.load();

    const html = renderToString(createElement(RouterProvider, { router }));

    expect(html).to.contain('href="/docs/guides/intro"');
    expect(html).to.contain('href="https://status.example.com"');
  });
});
