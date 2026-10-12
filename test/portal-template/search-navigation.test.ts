import fs from 'node:fs';
import { createRequire } from 'node:module';
import { expect } from 'chai';

/** An installed module's code, as the portal's build bundles it. */
const installed = (specifier: string) => fs.readFileSync(createRequire(import.meta.url).resolve(specifier), 'utf8');

// `search.tsx` hands the dialog served URLs, right only while it navigates by href and the router strips
// the base once: a failure here is an upgrade that changed one of them, which only a browser would show.
describe('search navigation under a base', () => {
  it("has Fumadocs' search dialog navigate to a result by its URL", () => {
    expect(installed('fumadocs-ui/components/dialog/search')).to.contain('router.push(item.url)');
  });

  it("has Fumadocs' TanStack adapter push by href", () => {
    expect(installed('fumadocs-core/framework/tanstack')).to.contain('router.navigate({ href: url })');
  });

  it('has the router strip the base from an href once, from a page starting like the base too', async () => {
    // Its ES module build: the CommonJS one warns of a circular require when loaded.
    const { createMemoryHistory, createRootRoute, createRoute, createRouter } = await import('@tanstack/react-router');
    const root = createRootRoute();
    const router = createRouter({
      routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '$' })]),
      basepath: '/api',
      history: createMemoryHistory({ initialEntries: ['/api/'] })
    });
    await router.load();

    await router.navigate({ href: '/api/api/calc/Calculate' });

    expect(router.state.location.pathname).to.equal('/api/calc/Calculate');
    expect(router.history.location.pathname).to.equal('/api/api/calc/Calculate');
  });
});
