import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'chai';
import { externalHref, fullAddress, withBasePath } from '../../portal-template/src/lib/base-path';

const ROUTES = 'portal-template/src/routes';

/** The path each route file declares to `createFileRoute`. */
const routePaths = (): string[] =>
  fs
    .readdirSync(ROUTES, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file))
    .flatMap(
      (file) => /createFileRoute\('([^']*)'\)/.exec(fs.readFileSync(path.join(ROUTES, file), 'utf8'))?.[1] ?? []
    );

describe('withBasePath', () => {
  // Outside Vite there is no `import.meta.env`, so the portal is taken to be at the root.
  it('leaves a path alone at the root', () => {
    expect(withBasePath('/guides/intro')).to.equal('/guides/intro');
    expect(withBasePath('/guides/intro', '/')).to.equal('/guides/intro');
  });

  it('puts a path under the base it is given', () => {
    expect(withBasePath('/guides/intro', '/docs/')).to.equal('/docs/guides/intro');
    expect(withBasePath('/', '/docs/')).to.equal('/docs/');
    expect(withBasePath('/api/search.json', '/api/')).to.equal('/api/api/search.json');
  });
});

describe('externalHref', () => {
  const UNPREFIXED = ['/robots.txt', '/{$}.md'];

  // A route writing a file has an extension on its last segment.
  it('puts every file a route writes under the base, but robots.txt and the pages’ .md copies', () => {
    const files = routePaths().filter((route) => /\.\w+$/.test(route));
    expect(files).to.include.members(['/llms.txt', ...UNPREFIXED]);

    for (const route of files) {
      const address = route.replace('{$}', 'guides/intro');
      expect(externalHref(address, '/docs/'), route).to.equal(UNPREFIXED.includes(route) ? address : `/docs${address}`);
    }
  });

  it('puts a file under a base its own path starts with', () => {
    expect(externalHref('/api/search.json', '/api/')).to.equal('/api/api/search.json');
  });
});

describe('fullAddress', () => {
  const global = globalThis as { window?: unknown };

  afterEach(() => {
    delete global.window;
  });

  it('is the path itself where there is no window, as in the prerender', () => {
    expect(fullAddress('/guides/intro.md')).to.equal('/guides/intro.md');
  });

  it('is the address the browser loaded the portal from, in the browser', () => {
    global.window = { location: { origin: 'https://docs.test' } };

    expect(fullAddress('/guides/intro.md')).to.equal('https://docs.test/guides/intro.md');
    expect(fullAddress('/')).to.equal('https://docs.test/');
  });
});
