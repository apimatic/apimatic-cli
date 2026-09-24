import { expect } from 'chai';
import { loader } from 'fumadocs-core/source';
import { findProjection, flattenTree } from 'fumadocs-core/page-tree';
import type { Folder, Node, Root } from 'fumadocs-core/page-tree';
import { isLayoutTabActive } from 'fumadocs-ui/layouts/shared';
import {
  GENERATED_SOURCE,
  navigationTransformer,
  OPENAPI_SOURCE,
  tabsTransformer
} from '../../portal-template/src/lib/navigation';
import { portalTabs } from '../../portal-template/src/lib/tabs';

/**
 * The tabs the transformers make of a real `loader()`'s tree, and the list the layouts are
 * given. Built in memory, as `navigation.test.ts` does, so a test can add the generated source.
 */
describe('tabsTransformer', () => {
  type File = { type: 'page' | 'meta'; path: string; data: Record<string, unknown> };
  type Sources = { docs?: File[]; openapi?: File[]; generated?: File[] };

  const page = (path: string, title: string): File => ({ type: 'page', path, data: { title } });
  const meta = (path: string, data: Record<string, unknown>): File => ({ type: 'meta', path, data });

  const build = (sources: Sources) => {
    const input: Record<string, { files: File[]; baseDir?: string }> = {};
    if (sources.docs) input.docs = { files: sources.docs };
    if (sources.generated) input[GENERATED_SOURCE] = { files: sources.generated };
    if (sources.openapi) input[OPENAPI_SOURCE] = { files: sources.openapi, baseDir: 'api' };
    // The page-tree options of `source.server.ts`, in the same order.
    return loader(input, {
      baseUrl: '/',
      pageTree: { transformers: [navigationTransformer(), tabsTransformer()], generateFallback: false }
    });
  };

  const treeOf = (sources: Sources): Root => build(sources).pageTree;

  const nameOf = (node: Node): string => (typeof node.name === 'string' ? node.name : '?');

  /** Each tab by name, with the names of what it holds. */
  const tabsOf = (sources: Sources): Record<string, string[]> =>
    Object.fromEntries(
      treeOf(sources).children.map((tab) => [nameOf(tab), tab.type === 'folder' ? tab.children.map(nameOf) : []])
    );

  const tabNames = (sources: Sources): string[] => treeOf(sources).children.map(nameOf);

  const tab = (tree: Root, name: string): Folder => {
    const found = tree.children.find((child) => child.type === 'folder' && child.name === name);
    if (found === undefined || found.type !== 'folder') throw new Error(`no tab named ${name}`);
    return found;
  };

  const CONTENT = [page('index.mdx', 'Welcome'), page('authentication.mdx', 'Authentication')];
  const API = [page('petstore/pet/addPet.mdx', 'Add a pet'), page('petstore/store/inventory.mdx', 'Inventory')];
  const TUTORIALS = [
    page('tutorials/first-call.mdx', 'First call'),
    page('tutorials/errors.mdx', 'Errors'),
    meta('tutorials/nav.json', { title: 'Tutorials', root: true })
  ];
  /** What the CLI writes, each folder titled by its nav.json whatever its index page says. */
  const SDKS = [
    page('sdks/index.mdx', 'All the SDKs'),
    page('sdks/typescript.mdx', 'TypeScript'),
    page('sdks/python.mdx', 'Python'),
    meta('sdks/nav.json', { title: 'SDKs', pages: ['typescript', 'python'] })
  ];
  const PLUGIN = [
    page('context-plugin/index.mdx', 'Install the plugin'),
    meta('context-plugin/nav.json', { title: 'Context Plugin' })
  ];
  const GENERATED = [...SDKS, ...PLUGIN];

  it('makes every top-level node part of exactly one tab, each a root folder', () => {
    const tree = treeOf({ docs: [...CONTENT, ...TUTORIALS], openapi: API });

    expect(tree.children.every((child) => child.type === 'folder' && child.root === true)).to.be.true;
    expect(tabsOf({ docs: [...CONTENT, ...TUTORIALS], openapi: API })).to.deep.equal({
      Home: ['Welcome'],
      Guides: ['Authentication'],
      Tutorials: ['Errors', 'First call'],
      'API Reference': ['Pet', 'Store']
    });
  });

  it('orders the tabs by where each one’s first node sits in the root nav.json', () => {
    const docs = [...CONTENT, ...TUTORIALS, meta('nav.json', { pages: ['index', 'apimatic:api', 'tutorials', '...'] })];

    expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'API Reference', 'Tutorials', 'Guides']);
  });

  it('gives the defaults with no nav.json at all: Home, Guides, then the API reference', () => {
    expect(tabNames({ docs: CONTENT, openapi: API })).to.deep.equal(['Home', 'Guides', 'API Reference']);
  });

  it('keeps the generated tabs before the API reference, SDKs first, when no token is named', () => {
    expect(tabNames({ docs: CONTENT, generated: GENERATED, openapi: API })).to.deep.equal([
      'Home',
      'Guides',
      'SDKs',
      'Context Plugin',
      'API Reference'
    ]);
  });

  // The label is the CLI's, from the folder's nav.json, and the index page opens the tab.
  it('makes each generated folder a tab named by its nav.json, listing its index page first', () => {
    const tabs = tabsOf({ docs: CONTENT, generated: GENERATED, openapi: API });

    expect(tabs.SDKs).to.deep.equal(['All the SDKs', 'TypeScript', 'Python']);
    expect(tabs['Context Plugin']).to.deep.equal(['Install the plugin']);
    expect(
      portalTabs(treeOf({ docs: CONTENT, generated: GENERATED, openapi: API })).map((each) => [each.title, each.url])
    ).to.deep.include.members([
      ['SDKs', '/sdks'],
      ['Context Plugin', '/context-plugin']
    ]);
  });

  it('places each generated tab where its token puts it', () => {
    const docs = [
      ...CONTENT,
      meta('nav.json', { pages: ['index', 'apimatic:plugin', 'apimatic:api', 'apimatic:sdks'] })
    ];

    // The unnamed page joins the named one before it, so Guides follows Home.
    expect(tabNames({ docs, generated: GENERATED, openapi: API })).to.deep.equal([
      'Home',
      'Guides',
      'Context Plugin',
      'API Reference',
      'SDKs'
    ]);
  });

  // The home page opens the site whatever order the rest of the file sets.
  it('puts Home first when the root nav.json does not name the index page', () => {
    const docs = [...CONTENT, meta('nav.json', { pages: ['authentication', '...'] })];

    expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'Guides', 'API Reference']);
  });

  it('keeps Home where the file puts the index page when it names it', () => {
    const docs = [...CONTENT, meta('nav.json', { pages: ['authentication', 'apimatic:api', 'index'] })];

    expect(tabNames({ docs, openapi: API })).to.deep.equal(['Guides', 'API Reference', 'Home']);
  });

  // Tabs group; they do not reorder what they hold.
  it('gathers loose nodes either side of a folder tab into one Guides tab, in order', () => {
    const docs = [
      ...CONTENT,
      ...TUTORIALS,
      page('changelog.mdx', 'Changelog'),
      meta('nav.json', { pages: ['index', 'authentication', 'tutorials', 'changelog'] })
    ];

    expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'Guides', 'Tutorials', 'API Reference']);
    expect(tabsOf({ docs, openapi: API }).Guides).to.deep.equal(['Authentication', 'Changelog']);
  });

  it('keeps an ordinary folder inside Guides', () => {
    const docs = [...CONTENT, page('guides/intro.mdx', 'Intro')];

    expect(tabsOf({ docs, openapi: API }).Guides).to.deep.equal(['Authentication', 'Guides']);
  });

  it('makes no Guides tab when every loose page is in another tab', () => {
    const docs = [page('index.mdx', 'Welcome'), ...TUTORIALS];

    expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'Tutorials', 'API Reference']);
  });

  it('makes no tab for a section that is not generated', () => {
    expect(tabNames({ docs: CONTENT, openapi: API })).to.not.include.members(['SDKs', 'Context Plugin']);
    expect(tabNames({ docs: CONTENT, generated: SDKS, openapi: API })).to.not.include('Context Plugin');
  });

  // Matching tabs to folders goes by id on the client, after the tree has been serialised.
  it('gives the tabs no folder backs fixed ids', () => {
    const ids = treeOf({ docs: CONTENT, generated: GENERATED, openapi: API }).children.map((child) => child.$id);

    expect(ids.slice(0, 2)).to.deep.equal(['/tab/home', '/tab/guides']);
    expect(ids.slice(2).filter((id) => id?.startsWith('/tab/'))).to.be.empty;
  });

  // Fumadocs ids a folder by its path, so a directory could be named after an id that was.
  it('keeps those ids apart from any a directory could be given', () => {
    const docs = [...CONTENT, page('tab:guides/intro.mdx', 'Intro')];
    const ids = treeOf({ docs }).children.flatMap((child) =>
      child.type === 'folder' ? [child.$id, ...child.children.map((node) => node.$id)] : []
    );

    expect(new Set(ids).size).to.equal(ids.length);
  });

  // Fumadocs points a tab at the page with the same path in the tab being left, when there is
  // one, and finds it through the folders' `$ref`.
  it('opens each tab where its own list starts, whichever page is being read', () => {
    const docs = [
      ...CONTENT,
      ...TUTORIALS,
      page('tutorials/overview.mdx', 'Overview'),
      page('api/overview.mdx', 'API overview')
    ];
    const tree = treeOf({ docs, generated: GENERATED, openapi: API });
    const reading = flattenTree(tab(tree, 'Tutorials').children).find((node) => node.url === '/tutorials/overview');

    for (const other of tree.children) {
      expect(other.type === 'folder' && other.$ref, nameOf(other)).to.not.be.ok;
      if (other.type === 'folder' && reading !== undefined) {
        expect(findProjection(tab(tree, 'Tutorials'), other, reading), nameOf(other)).to.be.undefined;
      }
    }
    expect(reading).to.not.be.undefined;
  });

  // Checked with Fumadocs' own test, on every page of a tree with each kind of tab.
  it('makes exactly one tab active on every page', () => {
    const docs = [
      ...CONTENT,
      ...TUTORIALS,
      page('tutorials/index.mdx', 'Tutorials home'),
      page('tutorials/deep/more.mdx', 'More'),
      page('guides/intro.mdx', 'Intro'),
      page('api/index.mdx', 'Reference')
    ];
    const tree = treeOf({ docs, generated: GENERATED, openapi: API });
    const tabs = portalTabs(tree);

    const urls = flattenTree(tree.children).map((node) => node.url);
    expect(urls).to.include.members([
      '/',
      '/tutorials',
      '/tutorials/deep/more',
      '/api/petstore/pet/addPet',
      '/sdks',
      '/sdks/typescript',
      '/context-plugin'
    ]);
    for (const url of urls) {
      const active = tabs.filter((each) => isLayoutTabActive(each, url)).map((each) => each.title);
      expect(active, url).to.have.lengthOf(1);
    }
  });

  describe('a folder tab', () => {
    it('takes its name from its nav.json title', () => {
      const docs = [
        ...CONTENT,
        page('tutorials/first-call.mdx', 'First call'),
        meta('tutorials/nav.json', { title: 'Learn', root: true })
      ];

      expect(tabNames({ docs })).to.deep.equal(['Home', 'Guides', 'Learn']);
    });

    // Fumadocs never reads `root`, so a tab's folder is built, and named, as any other is.
    it('takes its name from its index page when the file gives none', () => {
      const docs = [
        ...CONTENT,
        page('tutorials/index.mdx', 'Learn the API'),
        page('tutorials/first-call.mdx', 'First call'),
        meta('tutorials/nav.json', { root: true })
      ];

      expect(tabsOf({ docs })['Learn the API']).to.deep.equal(['Learn the API', 'First call']);
    });

    it('takes its name from its directory when there is neither', () => {
      const docs = [
        ...CONTENT,
        page('tutorials/first-call.mdx', 'First call'),
        meta('tutorials/nav.json', { root: true })
      ];

      expect(tabNames({ docs })).to.include('Tutorials');
    });

    // A root folder's own link is not listed in its sidebar, and the active tab is found from
    // what it lists, so the page it opens on leads them. The CLI refuses an entry placing it.
    it('lists its index page first, whatever its nav.json says', () => {
      const docs = [
        ...CONTENT,
        page('tutorials/index.mdx', 'Overview'),
        page('tutorials/first-call.mdx', 'First call'),
        page('tutorials/errors.mdx', 'Errors'),
        meta('tutorials/nav.json', { title: 'Tutorials', root: true, pages: ['first-call', 'index', 'errors'] })
      ];
      const tutorials = tab(treeOf({ docs }), 'Tutorials');

      expect(tutorials.index).to.be.undefined;
      expect(tutorials.children.map(nameOf)).to.deep.equal(['Overview', 'First call', 'Errors']);
    });

    it('changes no address', () => {
      const urls = build({ docs: [...CONTENT, ...TUTORIALS] })
        .getPages()
        .map((each) => each.url);

      expect(urls).to.include.members(['/tutorials/first-call', '/authentication', '/']);
    });

    // The CLI refuses both. Honouring either would nest one tab bar inside another, or give
    // the reference a second tab, in a preview the next build refuses.
    it('is not made of a nested folder, which stays a folder in its tab', () => {
      const docs = [
        ...CONTENT,
        page('guides/deep/intro.mdx', 'Intro'),
        meta('guides/deep/nav.json', { title: 'Deep', root: true })
      ];
      const tree = treeOf({ docs });
      const guides = tab(tree, 'Guides').children.find((child) => child.type === 'folder');
      const deep = guides?.type === 'folder' ? guides.children.find((child) => child.type === 'folder') : undefined;

      expect(tabNames({ docs })).to.deep.equal(['Home', 'Guides']);
      expect(deep?.type === 'folder' && deep.root).to.not.be.ok;
    });

    it('is not made of a half-typed setting', () => {
      const docs = [
        ...CONTENT,
        page('tutorials/first-call.mdx', 'First call'),
        meta('tutorials/nav.json', { root: 'yes' })
      ];

      expect(tabsOf({ docs })).to.deep.equal({ Home: ['Welcome'], Guides: ['Authentication', 'Tutorials'] });
    });

    it('is not made of the API reference twice', () => {
      const docs = [...CONTENT, meta('api/nav.json', { root: true })];

      expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'Guides', 'API Reference']);
    });
  });

  describe('the API reference tab', () => {
    it('takes its name from content/api/nav.json', () => {
      const docs = [...CONTENT, meta('api/nav.json', { title: 'REST API' })];

      expect(tabNames({ docs, openapi: API })).to.include('REST API');
    });

    // A root folder's own link is not listed in its sidebar, and Fumadocs does not look there
    // when it decides which tab is active, so the page moves in among the reference pages.
    it('lists a content/api index page first among its pages, and takes its name', () => {
      const docs = [...CONTENT, page('api/index.mdx', 'Reference')];
      const reference = tab(treeOf({ docs, openapi: API }), 'Reference');

      expect(reference.index).to.be.undefined;
      expect(reference.children.map(nameOf)).to.deep.equal(['Reference', 'Pet', 'Store']);
    });
  });

  describe('the home page', () => {
    // The route renders a landing page at `/` for a project without an index page, but with
    // no node to reach it the page sits outside every tab and shows no tab bar.
    it('gets a node of its own when the content has no index page', () => {
      const tree = treeOf({ docs: [page('authentication.mdx', 'Authentication')], openapi: API });
      const home = tab(tree, 'Home');

      expect(tree.children.map(nameOf)).to.deep.equal(['Home', 'Guides', 'API Reference']);
      expect(home.children).to.have.lengthOf(1);
      expect(home.children[0]).to.include({ type: 'page', url: '/' });
    });

    it('gets one too when there is no content at all', () => {
      expect(tabNames({ openapi: API })).to.deep.equal(['Home', 'API Reference']);
    });

    // Without an index page, an `index` entry names a folder of that name, not the home page.
    it('leads with that node however the file names index', () => {
      const docs = [
        page('index/setup.mdx', 'Setup'),
        page('authentication.mdx', 'Authentication'),
        meta('nav.json', { pages: ['index', 'authentication'] })
      ];

      expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'Guides', 'API Reference']);
    });

    // The same URL may appear only once in a page tree.
    it('gets none when a page deeper down is served at the address', () => {
      const docs = [page('(start)/index.mdx', 'Welcome'), page('authentication.mdx', 'Authentication')];

      expect(tabNames({ docs })).to.not.include('Home');
    });
  });
});

describe('portalTabs', () => {
  const pageNode = (url: string, name = url): Node => ({ type: 'page', name, url });
  const folder = (name: string, children: Node[], extra: Partial<Folder> = {}): Folder => ({
    type: 'folder',
    name,
    children,
    ...extra
  });

  it('lists one tab per root folder, bound to it', () => {
    const home = folder('Home', [pageNode('/')], { root: true, $id: '/tab/home' });
    const guides = folder('Guides', [pageNode('/authentication')], { root: true, $id: '/tab/guides' });

    const tabs = portalTabs({ name: 'Docs', children: [home, guides] });

    expect(tabs.map((each) => [each.title, each.url])).to.deep.equal([
      ['Home', '/'],
      ['Guides', '/authentication']
    ]);
    expect(tabs[0].$folder).to.equal(home);
  });

  // Fumadocs' own list looks at direct pages only, and the reference has none.
  it('opens a tab of folders on the first page found beneath them, depth first', () => {
    const api = folder(
      'API Reference',
      [folder('Pet', [folder('Deep', [pageNode('/api/petstore/pet/addPet')])]), pageNode('/api/later')],
      { root: true }
    );

    expect(portalTabs({ name: 'Docs', children: [api] })[0].url).to.equal('/api/petstore/pet/addPet');
  });

  it('opens on a folder’s own index page ahead of its children', () => {
    const tutorials = folder(
      'Tutorials',
      [folder('Deep', [pageNode('/deep')], { index: { type: 'page', name: 'Deep home', url: '/deep-home' } })],
      {
        root: true
      }
    );

    expect(portalTabs({ name: 'Docs', children: [tutorials] })[0].url).to.equal('/deep-home');
  });

  it('passes over a link that leaves the portal', () => {
    const guides = folder(
      'Guides',
      [{ type: 'page', name: 'Status', url: 'https://status.test', external: true }, pageNode('/start')],
      { root: true }
    );

    expect(portalTabs({ name: 'Docs', children: [guides] })[0].url).to.equal('/start');
  });

  it('leaves out a folder that is no tab, and a tab with no page to open', () => {
    const tabs = portalTabs({
      name: 'Docs',
      children: [folder('Plain', [pageNode('/plain')]), folder('Empty', [], { root: true }), pageNode('/loose')]
    });

    expect(tabs).to.be.empty;
  });
});
