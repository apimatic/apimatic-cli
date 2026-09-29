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
import { frontmatter } from 'fumadocs-core/content/md/frontmatter';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { FileName } from '../../src/types/file/fileName';
import { parsePage } from '../../src/types/portal/page';
import { untitledTabName } from '../../src/types/portal/portal-tabs';

/**
 * The tabs the transformers make of a real `loader()`'s tree, and the list the layouts are
 * given. Built in memory, as `navigation.test.ts` does, so a test can add the generated source.
 */
describe('tabsTransformer', () => {
  type File = { type: 'page' | 'meta'; path: string; data: Record<string, unknown> };
  type Sources = { docs?: File[]; openapi?: File[]; generated?: File[] };

  const page = (path: string, title: string): File => ({ type: 'page', path, data: { title } });
  const meta = (path: string, data: Record<string, unknown>): File => ({ type: 'meta', path, data });
  /** The root `nav.json`: `tabs` lists the tabs after Home, and `pages` orders Home's sidebar. */
  const root = (tabs: string[], pages?: string[]): File =>
    meta('nav.json', pages === undefined ? { tabs } : { tabs, pages });

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
    meta('tutorials/nav.json', { title: 'Tutorials' })
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
    const docs = [...CONTENT, ...TUTORIALS, root(['tutorials'], ['index', 'authentication'])];
    const tree = treeOf({ docs, openapi: API });

    expect(tree.children.every((child) => child.type === 'folder' && child.root === true)).to.be.true;
    expect(tabsOf({ docs, openapi: API })).to.deep.equal({
      Home: ['Welcome', 'Authentication'],
      Tutorials: ['Errors', 'First call'],
      'API Reference': ['Pet', 'Store']
    });
  });

  it('orders the tabs as the root nav.json’s tabs orders them', () => {
    const docs = [...CONTENT, ...TUTORIALS, root(['apimatic:api', 'tutorials'], ['index', '...'])];

    expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'API Reference', 'Tutorials']);
  });

  it('makes a tab of a folder only when tabs lists it, wherever pages puts it', () => {
    const docs = [...CONTENT, ...TUTORIALS, page('guides/intro.mdx', 'Intro')];

    expect(tabNames({ docs: [...docs, root(['tutorials'], ['index', 'guides', 'authentication'])] })).to.deep.equal([
      'Home',
      'Tutorials'
    ]);
    expect(tabNames({ docs: [...docs, root([], ['index', 'tutorials', 'guides'])] })).to.deep.equal(['Home']);
  });

  // The whole point of `tabs`: a folder can now be ordered inside Home without becoming a tab.
  it('orders a top-level folder among Home’s pages when pages names it', () => {
    const docs = [...CONTENT, page('guides/intro.mdx', 'Intro'), root([], ['index', 'guides', 'authentication'])];

    expect(tabsOf({ docs, openapi: API })).to.deep.equal({
      Home: ['Welcome', 'Guides', 'Authentication'],
      'API Reference': ['Pet', 'Store']
    });
  });

  // The defaults `pages` gave the root before `tabs` existed, read from `tabs` instead.
  describe('the tabs that tabs does not name', () => {
    const defaults: { rule: string; file: File; generated: File[]; tabs: string[] }[] = [
      {
        rule: 'leave the generated sections before the API reference, SDKs first, after the named folders',
        file: root(['tutorials']),
        generated: GENERATED,
        tabs: ['Home', 'Tutorials', 'SDKs', 'Context Plugin', 'API Reference']
      },
      {
        rule: 'put the generated sections after the last folder when the file puts the API reference before one',
        file: root(['apimatic:api', 'tutorials']),
        generated: GENERATED,
        tabs: ['Home', 'API Reference', 'Tutorials', 'SDKs', 'Context Plugin']
      },
      {
        rule: 'put an unnamed API reference last, after a named section',
        file: root(['apimatic:plugin', 'tutorials']),
        generated: GENERATED,
        tabs: ['Home', 'Context Plugin', 'Tutorials', 'SDKs', 'API Reference']
      },
      {
        rule: 'put an unnamed section last when pages places the API reference in Home',
        file: root(['tutorials'], ['index', 'apimatic:api']),
        generated: SDKS,
        tabs: ['Home', 'Tutorials', 'SDKs']
      }
    ];

    for (const { rule, file, generated, tabs } of defaults) {
      it(rule, () => {
        expect(tabNames({ docs: [...CONTENT, ...TUTORIALS, file], generated, openapi: API })).to.deep.equal(tabs);
      });
    }
  });

  describe('a section placed in Home', () => {
    it('is a folder in Home’s sidebar where its token sits, and no tab', () => {
      const docs = [...CONTENT, root([], ['index', 'apimatic:api', 'authentication', 'apimatic:plugin'])];

      expect(tabsOf({ docs, generated: GENERATED, openapi: API })).to.deep.equal({
        Home: ['Welcome', 'API Reference', 'Authentication', 'Context Plugin'],
        SDKs: ['All the SDKs', 'TypeScript', 'Python']
      });
    });

    it('keeps the API reference’s structure and title inside Home', () => {
      const docs = [...CONTENT, meta('api/nav.json', { title: 'REST API' }), root([], ['index', 'apimatic:api'])];
      const home = tab(treeOf({ docs, openapi: API }), 'Home');
      const reference = home.children.find((child) => child.name === 'REST API');

      expect(reference !== undefined && reference.type === 'folder' && reference.children.map(nameOf)).to.deep.equal([
        'Pet',
        'Store'
      ]);
      expect(reference !== undefined && reference.type === 'folder' && reference.root).to.not.be.true;
    });

    it('is placed by the api folder’s own name as well as by its token', () => {
      const docs = [...CONTENT, root([], ['index', 'api', 'authentication'])];

      expect(tabsOf({ docs, openapi: API })).to.deep.equal({ Home: ['Welcome', 'API Reference', 'Authentication'] });
    });

    // Tree position never sets an address.
    it('changes no address', () => {
      const docs = [...CONTENT, root([], ['index', 'apimatic:api', 'apimatic:sdks', 'apimatic:plugin'])];
      const urls = build({ docs, generated: GENERATED, openapi: API })
        .getPages()
        .map((each) => each.url);

      expect(urls).to.include.members([
        '/api/petstore/pet/addPet',
        '/sdks',
        '/sdks/typescript',
        '/context-plugin',
        '/'
      ]);
    });

    // A switcher with one choice switches nothing, so the layout is given no tabs at all.
    it('leaves Home alone, with no tab for the layout, once every section is placed there', () => {
      const docs = [...CONTENT, root([], ['index', 'apimatic:api', 'apimatic:sdks', 'apimatic:plugin'])];
      const tree = treeOf({ docs, generated: GENERATED, openapi: API });

      expect(tree.children.map(nameOf)).to.deep.equal(['Home']);
      expect(tree.children[0]).to.include({ type: 'folder', root: true });
      expect(portalTabs(tree)).to.be.empty;
    });

    it('still gives the layout its tabs while any section is a tab', () => {
      const docs = [...CONTENT, root([], ['index', 'apimatic:api'])];

      expect(portalTabs(treeOf({ docs, generated: SDKS, openapi: API })).map((each) => each.title)).to.deep.equal([
        'Home',
        'SDKs'
      ]);
    });

    // The CLI refuses a node in both lists; the template still has to do one thing with it.
    it('stays in Home when tabs names it too, while a folder in both lists is a tab', () => {
      const docs = [...CONTENT, ...TUTORIALS, root(['apimatic:api', 'tutorials'], ['index', 'api', 'tutorials'])];

      expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'Tutorials']);
    });
  });

  it('gives the defaults with no nav.json at all: Home, then the API reference', () => {
    expect(tabNames({ docs: CONTENT, openapi: API })).to.deep.equal(['Home', 'API Reference']);
  });

  it('keeps the generated tabs before the API reference, SDKs first, when no token is named', () => {
    expect(tabNames({ docs: CONTENT, generated: GENERATED, openapi: API })).to.deep.equal([
      'Home',
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
    const docs = [...CONTENT, root(['apimatic:plugin', 'apimatic:api', 'apimatic:sdks'], ['index'])];

    expect(tabNames({ docs, generated: GENERATED, openapi: API })).to.deep.equal([
      'Home',
      'Context Plugin',
      'API Reference',
      'SDKs'
    ]);
  });

  // The home page opens the site whatever order the rest of the file sets.
  it('puts Home first when the root nav.json does not name the index page', () => {
    const docs = [...CONTENT, root(['apimatic:api'], ['authentication', '...'])];

    expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'API Reference']);
  });

  // Listing `index` orders the pages inside Home, which would otherwise move as its pages did.
  it('puts Home first when the file lists the index page after another tab too', () => {
    const docs = [...CONTENT, ...TUTORIALS, root(['tutorials', 'apimatic:api'], ['authentication', 'index'])];

    expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'Tutorials', 'API Reference']);
    expect(tabsOf({ docs, openapi: API }).Home).to.deep.equal(['Authentication', 'Welcome']);
  });

  it('keeps the order the file gives in Home, and opens Home on the home page wherever it sits', () => {
    const docs = [...CONTENT, root([], ['authentication', 'index'])];

    expect(tabsOf({ docs, openapi: API }).Home).to.deep.equal(['Authentication', 'Welcome']);
    expect(portalTabs(treeOf({ docs, openapi: API }))[0]).to.include({ title: 'Home', url: '/' });
  });

  // Tabs group; they do not reorder what they hold.
  it('gathers loose nodes either side of a folder tab into Home, in order', () => {
    const docs = [
      ...CONTENT,
      ...TUTORIALS,
      page('changelog.mdx', 'Changelog'),
      root(['tutorials'], ['index', 'authentication', 'changelog'])
    ];

    expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'Tutorials', 'API Reference']);
    expect(tabsOf({ docs, openapi: API }).Home).to.deep.equal(['Welcome', 'Authentication', 'Changelog']);
  });

  it('keeps a folder the root nav.json does not list inside Home', () => {
    const docs = [...CONTENT, page('guides/intro.mdx', 'Intro')];

    expect(tabsOf({ docs, openapi: API }).Home).to.deep.equal(['Welcome', 'Authentication', 'Guides']);
  });

  it('keeps the folders the rest entry gathers inside Home, and makes tabs of the ones tabs lists', () => {
    const docs = [...CONTENT, ...TUTORIALS, page('guides/intro.mdx', 'Intro'), root(['tutorials'], ['index', '...'])];

    expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'Tutorials', 'API Reference']);
    expect(tabsOf({ docs, openapi: API }).Home).to.deep.equal(['Welcome', 'Authentication', 'Guides']);
  });

  it('makes no tab for a section that is not generated', () => {
    expect(tabNames({ docs: CONTENT, openapi: API })).to.deep.equal(['Home', 'API Reference']);
    expect(tabNames({ docs: CONTENT, generated: SDKS, openapi: API })).to.deep.equal(['Home', 'SDKs', 'API Reference']);
  });

  // Matching tabs to folders goes by id on the client, after the tree has been serialised.
  it('gives the tab no folder backs a fixed id', () => {
    const ids = treeOf({ docs: CONTENT, generated: GENERATED, openapi: API }).children.map((child) => child.$id);

    expect(ids[0]).to.equal('/tab/home');
    expect(ids.slice(1).filter((id) => id?.startsWith('/tab/'))).to.be.empty;
  });

  // Fumadocs ids a folder by its path, so a directory could be named after an id that was.
  it('keeps that id apart from any a directory could be given', () => {
    const docs = [...CONTENT, page('tab:home/intro.mdx', 'Intro')];
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
      page('api/overview.mdx', 'API overview'),
      root(['tutorials'], ['index', '...'])
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
      page('api/index.mdx', 'Reference'),
      root(['tutorials'], ['index', '...'])
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
        meta('tutorials/nav.json', { title: 'Learn' }),
        root(['tutorials'])
      ];

      expect(tabNames({ docs })).to.deep.equal(['Home', 'Learn']);
    });

    it('takes its name from its index page when its nav.json gives none', () => {
      const docs = [
        ...CONTENT,
        page('tutorials/index.mdx', 'Learn the API'),
        page('tutorials/first-call.mdx', 'First call'),
        root(['tutorials'])
      ];

      expect(tabsOf({ docs })['Learn the API']).to.deep.equal(['Learn the API', 'First call']);
    });

    it('takes its name from its directory when there is neither', () => {
      const docs = [...CONTENT, page('tutorials/first-call.mdx', 'First call'), root(['tutorials'])];

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
        meta('tutorials/nav.json', { title: 'Tutorials', pages: ['first-call', 'index', 'errors'] }),
        root(['tutorials'])
      ];
      const tutorials = tab(treeOf({ docs }), 'Tutorials');

      expect(tutorials.index).to.be.undefined;
      expect(tutorials.children.map(nameOf)).to.deep.equal(['Overview', 'First call', 'Errors']);
    });

    it('changes no address', () => {
      const urls = build({ docs: [...CONTENT, ...TUTORIALS, root(['tutorials'])] })
        .getPages()
        .map((each) => each.url);

      expect(urls).to.include.members(['/tutorials/first-call', '/authentication', '/']);
    });

    // Only the content root's file makes tabs; below it, an entry only orders its folder.
    it('is not made of a folder a nested nav.json lists, which stays a folder in its tab', () => {
      const docs = [
        ...CONTENT,
        page('guides/deep/intro.mdx', 'Intro'),
        meta('guides/nav.json', { pages: ['deep'] }),
        root(['guides'])
      ];
      const guides = tab(treeOf({ docs }), 'Guides');

      expect(tabNames({ docs })).to.deep.equal(['Home', 'Guides']);
      expect(guides.children.some((child) => child.type === 'folder' && child.root === true)).to.be.false;
    });

    // The CLI refuses `tabs` below the root; under `portal serve` the file still reloads to here.
    it('is not made by a tabs setting in a nested nav.json, which the CLI refuses', () => {
      const docs = [
        ...CONTENT,
        page('guides/deep/intro.mdx', 'Intro'),
        meta('guides/nav.json', { tabs: ['deep'] }),
        root(['guides'])
      ];
      const guides = tab(treeOf({ docs }), 'Guides');

      expect(tabNames({ docs })).to.deep.equal(['Home', 'Guides']);
      expect(guides.children.some((child) => child.type === 'folder' && child.root === true)).to.be.false;
    });

    it('is not made while tabs is half-typed as something other than an array of strings', () => {
      for (const tabs of ['tutorials', null, [1]]) {
        const docs = [...CONTENT, ...TUTORIALS, meta('nav.json', { tabs, pages: ['index'] })];

        expect(tabsOf({ docs }), JSON.stringify(tabs)).to.deep.equal({
          Home: ['Welcome', 'Authentication', 'Tutorials']
        });
      }
    });

    // Fumadocs' own key for a tab, which the CLI reports as an unknown setting.
    it('is not made by a root setting in the folder’s own nav.json', () => {
      const docs = [
        ...CONTENT,
        page('tutorials/first-call.mdx', 'First call'),
        meta('tutorials/nav.json', { root: true })
      ];

      expect(tabsOf({ docs })).to.deep.equal({ Home: ['Welcome', 'Authentication', 'Tutorials'] });
    });

    it('is not made of the API reference twice', () => {
      const docs = [...CONTENT, page('api/intro.mdx', 'Intro'), root(['api'])];

      expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'API Reference']);
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

  describe('the Home tab', () => {
    it('takes its name from the root nav.json title', () => {
      const docs = [...CONTENT, meta('nav.json', { title: 'Overview', pages: ['index', '...'] })];

      expect(tabsOf({ docs, openapi: API })).to.deep.include({ Overview: ['Welcome', 'Authentication'] });
    });

    // The CLI refuses one, but under `portal serve` a half-typed file reloads straight to here.
    it('keeps its name while the title is half-typed', () => {
      const docs = [...CONTENT, meta('nav.json', { title: ' ', pages: ['index', '...'] })];

      expect(tabNames({ docs })).to.deep.equal(['Home']);
    });

    // The route renders a landing page at `/` for a project without an index page, but with
    // no node to reach it the page sits outside every tab and shows no tab bar.
    it('opens on a node of its own when the content has no index page', () => {
      const tree = treeOf({ docs: [page('authentication.mdx', 'Authentication')], openapi: API });
      const home = tab(tree, 'Home');

      expect(tree.children.map(nameOf)).to.deep.equal(['Home', 'API Reference']);
      expect(home.children.map((child) => child.type === 'page' && child.url)).to.deep.equal(['/', '/authentication']);
    });

    it('is made even when there is no content at all', () => {
      expect(tabNames({ openapi: API })).to.deep.equal(['Home', 'API Reference']);
    });

    // Without an index page, an `index` entry names a folder of that name, a tab when tabs lists it.
    it('leads with that node however the file names index', () => {
      const docs = [
        page('index/setup.mdx', 'Setup'),
        page('authentication.mdx', 'Authentication'),
        root(['apimatic:api', 'index'], ['authentication'])
      ];

      expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'API Reference', 'Index']);
      expect(tabsOf({ docs, openapi: API }).Home).to.deep.equal(['Home', 'Authentication']);
    });

    // The same URL may appear only once in a page tree.
    it('opens on the home page a `(group)` folder serves, with no node of its own', () => {
      const docs = [page('(start)/index.mdx', 'Welcome'), page('authentication.mdx', 'Authentication')];
      const tree = treeOf({ docs, openapi: API });

      expect(tabsOf({ docs, openapi: API }).Home).to.deep.equal(['Authentication', 'Welcome']);
      expect(flattenTree(tree.children).map((node) => node.$id)).to.not.include('/page/home');
      expect(portalTabs(tree)[0]).to.include({ title: 'Home', url: '/' });
    });

    it('opens on the home page however deep in `(group)` folders it sits', () => {
      const docs = [page('(start)/a.mdx', 'A'), page('(start)/(inner)/index.mdx', 'Welcome')];

      expect(portalTabs(treeOf({ docs, openapi: API }))[0]).to.include({ title: 'Home', url: '/' });
    });

    // The CLI refuses the tabs entry, since the home page is the Home tab's.
    it('keeps a folder that serves the home page, even when the root nav.json’s tabs lists it', () => {
      const docs = [
        page('(start)/index.mdx', 'Welcome'),
        meta('(start)/nav.json', { title: 'Start' }),
        page('authentication.mdx', 'Authentication'),
        root(['(start)'])
      ];

      expect(tabsOf({ docs, openapi: API })).to.deep.include({ Home: ['Authentication', 'Start'] });
      expect(tabNames({ docs, openapi: API })).to.deep.equal(['Home', 'API Reference']);
    });

    it('orders a folder that serves the home page among its pages when pages lists it', () => {
      const docs = [
        page('(start)/index.mdx', 'Welcome'),
        meta('(start)/nav.json', { title: 'Start' }),
        page('authentication.mdx', 'Authentication'),
        root([], ['authentication', '(start)'])
      ];

      expect(tabsOf({ docs, openapi: API })).to.deep.include({ Home: ['Authentication', 'Start'] });
      expect(portalTabs(treeOf({ docs, openapi: API }))[0]).to.include({ title: 'Home', url: '/' });
    });
  });

  // The CLI warns about tabs that share a name, so it has to name each as the template does.
  describe('the names the CLI expects', () => {
    const folderNamed = (directory: string) =>
      untitledTabName({ kind: 'folder', directory: new DirectoryPath('content', directory) });

    it('gives the tabs no title names the names the CLI gives them', () => {
      expect(tabNames({ docs: CONTENT, openapi: API })).to.deep.equal([
        untitledTabName({ kind: 'home' }),
        untitledTabName({ kind: 'apiReference' })
      ]);
    });

    it('names a folder tab after its directory as the CLI does', () => {
      const docs = [
        ...CONTENT,
        page('getting-started/first.mdx', 'First'),
        page('(learn-more)/deep.mdx', 'Deep'),
        root(['getting-started', '(learn-more)'])
      ];

      expect(tabNames({ docs })).to.include.members([folderNamed('getting-started'), folderNamed('(learn-more)')]);
    });

    // fumadocs-mdx hands the loader what `frontmatter` parses, the parser the CLI reads a page with.
    it('names a folder tab after its index page as the CLI reads the page', async () => {
      const markdown = '---\ntitle: Learn the API\n--- \n# Learn';
      const data = frontmatter(markdown).data as File['data'];
      const docs: File[] = [
        ...CONTENT,
        { type: 'page', path: 'tutorials/index.mdx', data },
        page('tutorials/first.mdx', 'First'),
        root(['tutorials'])
      ];

      const parsed = await parsePage(markdown, new FileName('index.mdx'), 'tutorials/index.mdx');
      const { title } = parsed.frontMatter._unsafeUnwrap();

      expect(tabNames({ docs })).to.include(title);
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
    const tutorials = folder('Tutorials', [pageNode('/tutorials/first-call')], { root: true, $id: 'tutorials' });

    const tabs = portalTabs({ name: 'Docs', children: [home, tutorials] });

    expect(tabs.map((each) => [each.title, each.url])).to.deep.equal([
      ['Home', '/'],
      ['Tutorials', '/tutorials/first-call']
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

  it('opens a tab that holds the home page on it, wherever it is listed', () => {
    const home = folder('Home', [pageNode('/authentication'), folder('Start', [pageNode('/a'), pageNode('/')])], {
      root: true
    });

    expect(portalTabs({ name: 'Docs', children: [home] })[0].url).to.equal('/');
  });

  it('passes over a link that leaves the portal', () => {
    const home = folder(
      'Home',
      [{ type: 'page', name: 'Status', url: 'https://status.test', external: true }, pageNode('/start')],
      { root: true }
    );

    expect(portalTabs({ name: 'Docs', children: [home] })[0].url).to.equal('/start');
  });

  it('lists nothing when Home is the only tab, so the layout draws no switcher over one choice', () => {
    const home = folder('Home', [pageNode('/'), folder('API Reference', [pageNode('/api/x')])], {
      root: true,
      $id: '/tab/home'
    });

    expect(portalTabs({ name: 'Docs', children: [home] })).to.be.empty;
    expect(
      portalTabs({ name: 'Docs', children: [home, folder('SDKs', [pageNode('/sdks')], { root: true })] })
    ).to.have.lengthOf(2);
  });

  it('leaves out a folder that is no tab, and a tab with no page to open', () => {
    const tabs = portalTabs({
      name: 'Docs',
      children: [folder('Plain', [pageNode('/plain')]), folder('Empty', [], { root: true }), pageNode('/loose')]
    });

    expect(tabs).to.be.empty;
  });
});
