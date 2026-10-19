import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect } from 'chai';

/** An installed module's code, as the portal's build bundles it. */
const installed = (specifier: string) => fs.readFileSync(createRequire(import.meta.url).resolve(specifier), 'utf8');

// `copilot.tsx` hands the chat the service's paths unchanged, right only while the chat links them through
// the router, which adds the base once: a failure here is an upgrade that changed that, which only a browser would show.
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

  it("links a search's found pages the same way as the sources", () => {
    const chat = installed('@fumadocs/ai-chat');

    expect(chat).to.match(/jsxs?\(Link, \{\s*href: source\.url,/);
    expect(chat).to.match(/jsxs?\(Link, \{\s*href: doc\.url,/);
  });
});
