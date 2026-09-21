import { expect } from 'chai';
import { loader } from 'fumadocs-core/source';
import type { Node } from 'fumadocs-core/page-tree';
import { navigationTransformer } from '../../portal-template/src/lib/navigation';
import { PortalNavigation } from '../../src/types/portal/portal-navigation';

/**
 * The transformer against a real `loader()`. The sources are built in memory rather than on
 * disk, which is what lets a test add the generated source the template does not have yet.
 */
describe('navigationTransformer', () => {
  type File = { type: 'page' | 'meta'; path: string; data: Record<string, unknown> };

  const page = (path: string, title: string): File => ({ type: 'page', path, data: { title } });
  const nav = (path: string, pages: string[]): File => ({ type: 'meta', path, data: { pages } });

  /** Top-level names of the tree built from these sources, in order. */
  const treeOf = (sources: { docs?: File[]; openapi?: File[]; generated?: File[] }): string[] =>
    names(build(sources).pageTree.children);

  const build = (sources: { docs?: File[]; openapi?: File[]; generated?: File[] }) => {
    const input: Record<string, { files: File[]; baseDir?: string }> = {};
    if (sources.docs) input.docs = { files: sources.docs };
    if (sources.generated) input.generated = { files: sources.generated };
    if (sources.openapi) input.openapi = { files: sources.openapi, baseDir: 'api' };
    return loader(input, { baseUrl: '/', pageTree: { transformers: [navigationTransformer()] } });
  };

  const names = (children: Node[]): string[] =>
    children.map((child) => (typeof child.name === 'string' ? child.name : '?'));

  const childrenOf = (children: Node[], folder: string): Node[] => {
    const found = children.find((child) => child.type === 'folder' && child.name === folder);
    return found !== undefined && found.type === 'folder' ? found.children : [];
  };

  const CONTENT = [page('index.mdx', 'Welcome'), page('authentication.mdx', 'Authentication')];
  const API = [page('petstore/pet/addPet.mdx', 'Add a pet'), page('petstore/store/inventory.mdx', 'Inventory')];

  describe('with no nav.json', () => {
    it('keeps Fumadocs’ order for the user’s own pages', () => {
      expect(treeOf({ docs: CONTENT, openapi: API })).to.deep.equal(['Welcome', 'Authentication', 'Api']);
    });

    // Fumadocs sorts folders by path, so `api` lands above any user folder named later in
    // the alphabet. The defaults have to apply whether or not the user wrote a file.
    it('still puts the API reference last, below a user folder that sorts after it', () => {
      const docs = [...CONTENT, page('guides/intro.mdx', 'Intro')];

      expect(treeOf({ docs, openapi: API })).to.deep.equal(['Welcome', 'Authentication', 'Guides', 'Api']);
    });

    it('still collects the injected pages at the anchor rather than among the user’s pages', () => {
      const docs = [...CONTENT, page('tutorials.mdx', 'Tutorials')];

      expect(treeOf({ docs, generated: [page('sdks.mdx', 'SDKs')], openapi: API })).to.deep.equal([
        'Welcome',
        'Authentication',
        'Tutorials',
        'SDKs',
        'Api'
      ]);
    });

    // The root has no file of its own here, so its defaults must not depend on one.
    it('applies the root defaults when only a nested directory has a file', () => {
      const docs = [...CONTENT, page('guides/intro.mdx', 'Intro'), nav('guides/nav.json', ['intro'])];

      expect(treeOf({ docs, openapi: API })).to.deep.equal(['Welcome', 'Authentication', 'Guides', 'Api']);
    });
  });

  describe('a nav.json it cannot use', () => {
    // The CLI refuses these, but only at startup: during `portal serve` a half-typed file
    // reloads straight into the transformer.
    it('leaves the order alone for a file that is null, a string or an array', () => {
      for (const data of [null, 'hi', ['index']]) {
        const docs = [...CONTENT, { type: 'meta' as const, path: 'nav.json', data: data as never }];

        expect(treeOf({ docs, openapi: API })).to.deep.equal(['Welcome', 'Authentication', 'Api']);
      }
    });

    it('leaves the order alone when pages is not an array of strings', () => {
      const docs = [...CONTENT, { type: 'meta' as const, path: 'nav.json', data: { pages: 'index' } }];

      expect(treeOf({ docs, openapi: API })).to.deep.equal(['Welcome', 'Authentication', 'Api']);
    });
  });

  describe('ordering the user’s pages', () => {
    it('emits named entries in the order given', () => {
      const docs = [...CONTENT, nav('nav.json', ['authentication', 'index'])];

      expect(treeOf({ docs })).to.deep.equal(['Authentication', 'Welcome']);
    });

    it('puts what is not named where the rest token sits', () => {
      const docs = [...CONTENT, page('guides.mdx', 'Guides'), nav('nav.json', ['guides', '...', 'index'])];

      expect(treeOf({ docs })).to.deep.equal(['Guides', 'Authentication', 'Welcome']);
    });

    it('keeps a page that is named nowhere, because there is nowhere for it to go', () => {
      const docs = [...CONTENT, page('extra.mdx', 'Extra'), nav('nav.json', ['index'])];

      expect(treeOf({ docs })).to.deep.equal(['Welcome', 'Authentication', 'Extra']);
    });

    it('ignores an entry that matches nothing, which the CLI has already refused', () => {
      const docs = [...CONTENT, nav('nav.json', ['nonsense', 'authentication'])];

      expect(treeOf({ docs })).to.deep.equal(['Authentication', 'Welcome']);
    });

    // The CLI refuses either token below the content root, so the transformer must not act
    // on one: otherwise the two halves of the format disagree about the same file.
    it('ignores an apimatic token in a nested directory, as the CLI refuses one there', () => {
      const docs = [
        ...CONTENT,
        page('guides/intro.mdx', 'Intro'),
        page('guides/advanced.mdx', 'Advanced'),
        nav('guides/nav.json', ['apimatic:api', 'advanced', 'intro'])
      ];

      expect(names(childrenOf(build({ docs, openapi: API }).pageTree.children, 'Guides'))).to.deep.equal([
        'Advanced',
        'Intro'
      ]);
    });

    it('orders a nested directory from its own file', () => {
      const docs = [
        ...CONTENT,
        page('guides/intro.mdx', 'Intro'),
        page('guides/advanced.mdx', 'Advanced'),
        nav('guides/nav.json', ['intro', 'advanced'])
      ];

      expect(names(childrenOf(build({ docs }).pageTree.children, 'Guides'))).to.deep.equal(['Intro', 'Advanced']);
    });
  });

  describe('the API reference', () => {
    it('goes where the token names it', () => {
      const docs = [...CONTENT, nav('nav.json', ['index', 'apimatic:api', 'authentication'])];

      expect(treeOf({ docs, openapi: API })).to.deep.equal(['Welcome', 'Api', 'Authentication']);
    });

    it('is last when the token is absent, rather than sorted among the pages', () => {
      const docs = [...CONTENT, nav('nav.json', ['authentication', 'index'])];

      expect(treeOf({ docs, openapi: API })).to.deep.equal(['Authentication', 'Welcome', 'Api']);
    });

    // Otherwise a rest token in the middle would drop the whole reference above the pages.
    it('stays last even when the rest token sits before the named pages', () => {
      const docs = [...CONTENT, nav('nav.json', ['...', 'index'])];

      expect(treeOf({ docs, openapi: API })).to.deep.equal(['Authentication', 'Welcome', 'Api']);
    });

    it('is never dropped, whatever the file says', () => {
      const docs = [...CONTENT, nav('nav.json', ['index'])];

      expect(treeOf({ docs, openapi: API })).to.contain('Api');
    });

    // `content/api/` lands on the same virtual path as the sections, so the two merge into
    // one folder. The token positions all of it, which is what `/api` is.
    it('is the whole api folder, including pages the user put under content/api', () => {
      const docs = [...CONTENT, page('api/overview.mdx', 'Overview'), nav('nav.json', ['apimatic:api', 'index'])];
      const tree = build({ docs, openapi: API }).pageTree.children;

      expect(names(tree)).to.deep.equal(['Api', 'Welcome', 'Authentication']);
      expect(names(childrenOf(tree, 'Api'))).to.contain('Overview');
    });

    // A folder the user simply has not listed belongs with their pages. Appending it after
    // everything named would drop it below the whole reference.
    it('stays below a page the file does not name, even when the token names it last', () => {
      const docs = [...CONTENT, page('guides/intro.mdx', 'Intro'), nav('nav.json', ['index', 'apimatic:api'])];

      expect(treeOf({ docs, openapi: API })).to.deep.equal(['Welcome', 'Authentication', 'Guides', 'Api']);
    });
  });

  describe('the injected pages', () => {
    const GENERATED = [page('sdks.mdx', 'SDKs')];

    it('go where the token names them', () => {
      const docs = [...CONTENT, nav('nav.json', ['index', 'apimatic:pages', 'authentication'])];

      expect(treeOf({ docs, generated: GENERATED, openapi: API })).to.deep.equal([
        'Welcome',
        'SDKs',
        'Authentication',
        'Api'
      ]);
    });

    // The anchor: after the user's content, before the API reference. A release that adds a
    // generated page must not land it in the middle of a sidebar nobody touched.
    it('collect at the anchor when the token is absent', () => {
      const docs = [...CONTENT, nav('nav.json', ['authentication', 'index'])];

      expect(treeOf({ docs, generated: GENERATED, openapi: API })).to.deep.equal([
        'Authentication',
        'Welcome',
        'SDKs',
        'Api'
      ]);
    });

    it('stay before the API reference even where that is named early', () => {
      const docs = [...CONTENT, nav('nav.json', ['apimatic:api', 'index', 'authentication'])];

      expect(treeOf({ docs, generated: GENERATED, openapi: API })).to.deep.equal([
        'SDKs',
        'Api',
        'Welcome',
        'Authentication'
      ]);
    });

    it('are not swept up by the rest token, which covers the user’s own pages', () => {
      const docs = [...CONTENT, nav('nav.json', ['...', 'index'])];

      expect(treeOf({ docs, generated: GENERATED, openapi: API })).to.deep.equal([
        'Authentication',
        'Welcome',
        'SDKs',
        'Api'
      ]);
    });

    it('resolve to nothing when there is no generated source, which is the case today', () => {
      const docs = [...CONTENT, nav('nav.json', ['index', 'apimatic:pages', 'authentication'])];

      expect(treeOf({ docs, openapi: API })).to.deep.equal(['Welcome', 'Authentication', 'Api']);
    });
  });

  /**
   * Why `source.ts` restricts the metadata collection to `**\/nav.json`. A folder's metadata
   * is read as `meta.meta`, so a loaded `meta.json` is applied before any transformer runs,
   * and a metadata file hides whatever it does not name. The transformer permutes the
   * children it is given and so cannot put the hidden pages back -- the restriction is the
   * only thing that makes "a leftover meta.json is ignored" true.
   */
  /**
   * The CLI validates `nav.json` and the template applies it, from two copies of the same
   * token list. Renaming one side leaves the CLI accepting a language the template ignores,
   * and an ignored entry is silent by design, so each token is checked through both halves.
   */
  describe('the token vocabulary both halves share', () => {
    const accepts = (entry: string) =>
      PortalNavigation.parse(JSON.stringify({ pages: [entry, 'index'] }), {
        label: 'content/nav.json',
        isContentRoot: true,
        childNames: ['index', 'authentication']
      }).isOk();

    it('accepts and applies the rest token', () => {
      expect(accepts('...')).to.be.true;

      const docs = [...CONTENT, page('guides.mdx', 'Guides'), nav('nav.json', ['...', 'index'])];
      expect(treeOf({ docs })).to.deep.equal(['Authentication', 'Guides', 'Welcome']);
    });

    it('accepts and applies the API reference token', () => {
      expect(accepts('apimatic:api')).to.be.true;

      const docs = [...CONTENT, nav('nav.json', ['apimatic:api', 'index', 'authentication'])];
      expect(treeOf({ docs, openapi: API })).to.deep.equal(['Api', 'Welcome', 'Authentication']);
    });

    it('accepts and applies the injected pages token', () => {
      expect(accepts('apimatic:pages')).to.be.true;

      const docs = [...CONTENT, nav('nav.json', ['apimatic:pages', 'index', 'authentication'])];
      expect(treeOf({ docs, generated: [page('sdks.mdx', 'SDKs')] })).to.deep.equal([
        'SDKs',
        'Welcome',
        'Authentication'
      ]);
    });
  });

  describe('a meta.json that reaches the storage', () => {
    const leftover = { type: 'meta' as const, path: 'meta.json', data: { pages: ['index'] } };

    it('wins over nav.json and hides what it does not name', () => {
      const docs = [...CONTENT, nav('nav.json', ['authentication', 'index']), leftover];

      expect(treeOf({ docs })).to.deep.equal(['Welcome']);
    });

    it('is harmless once it is not loaded, which is what the collection restriction does', () => {
      const docs = [...CONTENT, nav('nav.json', ['authentication', 'index'])];

      expect(treeOf({ docs })).to.deep.equal(['Authentication', 'Welcome']);
    });
  });
});
