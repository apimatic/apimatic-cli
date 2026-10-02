import { expect } from 'chai';
import { SDK_SECTION } from '../../../src/types/portal/generated-pages';
import { NavigationContext, PortalNavigation } from '../../../src/types/portal/portal-navigation';

describe('PortalNavigation', () => {
  const contextFor = (overrides: Partial<NavigationContext> = {}): NavigationContext => ({
    label: 'content/nav.json',
    isContentRoot: true,
    isApiDirectory: false,
    becomesFolder: true,
    childNames: ['index', 'authentication', 'guides'],
    folderNames: ['guides'],
    emptyFolders: [],
    homePageFolders: [],
    ...overrides
  });

  /** A file ordering with `pages` alone. */
  const validate = (pages: unknown, overrides: Partial<NavigationContext> = {}) =>
    PortalNavigation.validate(JSON.stringify({ pages }), contextFor(overrides));

  const errorsFor = (pages: unknown, overrides: Partial<NavigationContext> = {}) =>
    validate(pages, overrides)._unsafeUnwrapErr();

  describe('entries it accepts', () => {
    it('accepts pages, every token and the rest entry together', () => {
      expect(validate(['index', 'apimatic:sdks', 'authentication', 'apimatic:plugin', '...', 'apimatic:api']).isOk()).to
        .be.true;
    });

    it('accepts a subfolder by name', () => {
      expect(validate(['guides']).isOk()).to.be.true;
    });

    // Accepted whether or not apimatic.json has a plugin block: removing the block must not also
    // force an edit here, and under `portal serve` this file is not checked again when it goes.
    it('accepts the context plugin token, which resolves to nothing without a plugin block', () => {
      expect(validate(['apimatic:plugin']).isOk()).to.be.true;
    });

    // Renamed before any release, so the old name gets no hint: it is an unknown token.
    it('refuses the earlier name of the SDKs token like any unknown token', () => {
      expect(errorsFor(['apimatic:pages'])).to.deep.equal([
        "content/nav.json: 'apimatic:pages' is not a nav.json token. The tokens are 'apimatic:sdks', 'apimatic:plugin' and 'apimatic:api'."
      ]);
    });

    it('treats a file with no pages as ordering nothing', () => {
      expect(PortalNavigation.validate('{}', contextFor()).isOk()).to.be.true;
    });

    it('ignores surrounding whitespace in an entry', () => {
      expect(validate(['  index  ']).isOk()).to.be.true;
    });
  });

  describe('entries it refuses', () => {
    it('names the file and the entry when a page does not exist', () => {
      expect(errorsFor(['nonsense'])).to.deep.equal([
        "content/nav.json: 'nonsense' is not a page or folder in this directory."
      ]);
    });

    // The folder is there to see, so "not a page or folder" would send the user looking for it.
    it('says a folder with no page in it is no folder in the sidebar', () => {
      expect(errorsFor(['drafts'], { emptyFolders: ['drafts'] })).to.deep.equal([
        "content/nav.json: 'drafts' is a folder with no page in it or below it, so it is not in the sidebar. " +
          'Add a page to it, or remove the entry.'
      ]);
    });

    it('accepts the name of a page beside an empty folder of the same name', () => {
      expect(validate(['drafts'], { childNames: ['drafts'], emptyFolders: ['drafts'] }).isOk()).to.be.true;
    });

    it('suggests the intended page when the entry is a near miss', () => {
      expect(errorsFor(['Authentication'])[0]).to.contain("Did you mean 'authentication'?");
      expect(errorsFor(['authentication.md'])[0]).to.contain("Did you mean 'authentication'?");
    });

    // The template positions the folder, as Fumadocs does, so the page could never be placed.
    it('refuses a name that is both a page and a folder in the directory', () => {
      const errors = errorsFor(['guides'], { childNames: ['index', 'guides', 'guides'] });

      expect(errors).to.deep.equal([
        "content/nav.json: 'guides' is both a page and a folder in this directory, and the entry positions the folder. Rename the page to position it."
      ]);
    });

    it('refuses an entry addressing another directory', () => {
      expect(errorsFor(['guides/intro'])[0]).to.contain("'guides/intro' addresses another directory");
    });

    it('refuses an unknown apimatic token', () => {
      expect(errorsFor(['apimatic:sdk'])[0]).to.contain("'apimatic:sdk' is not a nav.json token");
    });

    it('refuses an empty entry', () => {
      expect(errorsFor([''])[0]).to.contain('must not contain an empty entry');
    });

    it('refuses a repeated entry', () => {
      expect(errorsFor(['index', 'index'])).to.deep.equal(["content/nav.json: 'index' is listed more than once."]);
    });

    it('reports every bad entry at once, so one edit fixes the file', () => {
      expect(errorsFor(['nope', 'apimatic:sdk', 'also-nope'])).to.have.lengthOf(3);
    });

    it('refuses a pages value that is not an array of strings', () => {
      expect(errorsFor('index')[0]).to.contain("'pages' must be an array of strings.");
      expect(errorsFor([1])[0]).to.contain("'pages' must be an array of strings.");
    });

    // The reference is mounted at the root of every portal, so `api` positions it whether or not
    // a directory is there to see; a near miss of the name is pointed at the token.
    it('positions the reference with api, and points a near miss of it at the token', () => {
      expect(validate(['api']).isOk()).to.be.true;
      expect(errorsFor(['Api'])).to.deep.equal([
        "content/nav.json: 'Api' is not a page or folder in this directory. The API reference is positioned with 'apimatic:api'."
      ]);
    });

    it('points a generated section named by its address or its word at its token', () => {
      expect(errorsFor(['sdks'])).to.deep.equal([
        "content/nav.json: 'sdks' is not a page or folder in this directory. 'apimatic:sdks' positions the SDK pages."
      ]);
      for (const entry of ['context-plugin', 'plugin', 'Plugin.md']) {
        expect(errorsFor([entry])[0], entry).to.contain("'apimatic:plugin' positions the context plugin page.");
      }
    });

    // `/plugin` is not reserved, so a page of that name is the user's to position.
    it('positions a page called plugin like any other page', () => {
      expect(validate(['plugin'], { childNames: ['index', 'plugin'] }).isOk()).to.be.true;
    });

    it('gives no section hint below the root', () => {
      expect(errorsFor(['sdks'], { isContentRoot: false })[0]).to.not.contain('apimatic:');
    });

    // `content/api` is the reference's mount point, and a directory the user keeps there
    // merges into it, so the name and the token reach one node: naming both names it twice,
    // and the template would honour whichever came first without a word.
    it('refuses api and apimatic:api together at the root, whichever comes first', () => {
      const withApi = { childNames: ['index', 'api'] };

      expect(validate(['api', 'index'], withApi).isOk()).to.be.true;
      expect(errorsFor(['api', 'index', 'apimatic:api'], withApi)).to.deep.equal([
        "content/nav.json: 'api' and 'apimatic:api' both position the API reference; keep one of them."
      ]);
      expect(errorsFor(['apimatic:api', 'api'], withApi)).to.deep.equal([
        "content/nav.json: 'apimatic:api' and 'api' both position the API reference; keep one of them."
      ]);
    });

    // A page of that name is a second child, and the entry reaches the folder, so the page
    // could never be positioned however the entry is spelled.
    it('refuses api at the root when a page of that name is a second child', () => {
      const errors = errorsFor(['index', 'api'], { childNames: ['index', 'api', 'api'] });

      expect(errors).to.have.lengthOf(1);
      expect(errors[0]).to.contain("'api' is where the API reference is mounted");
      expect(errors[0]).to.contain('Rename the page to position it');
      expect(errors[0]).to.not.contain('both a page and a folder');
    });

    it('names a folder called api below the root as an ordinary child', () => {
      expect(validate(['api'], { isContentRoot: false, childNames: ['api'] }).isOk()).to.be.true;
      expect(errorsFor(['api'], { isContentRoot: false })[0]).to.not.contain('apimatic:api');
    });

    it('names the file when the JSON is broken', () => {
      expect(PortalNavigation.validate('{', contextFor())._unsafeUnwrapErr()).to.deep.equal([
        'content/nav.json is not valid JSON.'
      ]);
    });

    it('refuses a document that is not an object', () => {
      expect(PortalNavigation.validate('[]', contextFor())._unsafeUnwrapErr()).to.deep.equal([
        'content/nav.json must contain a JSON object.'
      ]);
    });

    // The build re-reads the file itself with a plain JSON.parse, which the mark breaks, so
    // tolerating it here would only move the failure somewhere with a worse message.
    it('refuses a file written with a byte-order mark', () => {
      const mark = '﻿';

      expect(PortalNavigation.validate(mark + '{"pages":["index"]}', contextFor())._unsafeUnwrapErr()).to.deep.equal([
        'content/nav.json starts with a byte-order mark, which the build cannot read. Save the file as UTF-8 without a BOM.'
      ]);
    });

    it('names an unknown setting and lists the settings there are', () => {
      expect(PortalNavigation.validate('{"colour":"red"}', contextFor())._unsafeUnwrapErr()).to.deep.equal([
        "content/nav.json: 'colour' is not a nav.json setting. The settings are 'pages', 'title' and 'tabs'."
      ]);
    });
  });

  describe('tokens outside the content root', () => {
    const nested = { label: 'content/guides/nav.json', isContentRoot: false, childNames: ['index'] };

    it('refuses every token, because the nodes they position live at the root, and names both places it can go', () => {
      for (const token of ['apimatic:api', 'apimatic:sdks', 'apimatic:plugin']) {
        const errors = errorsFor([token], nested);

        expect(errors).to.have.lengthOf(1);
        expect(errors[0]).to.contain(`'${token}' can only be used in the nav.json at the top`);
        expect(errors[0]).to.contain(
          "List it in that file's 'tabs' to make it a tab, or in its 'pages' to place it in Home."
        );
      }
    });

    it('still accepts ordinary entries', () => {
      expect(validate(['intro'], { ...nested, childNames: ['intro'] }).isOk()).to.be.true;
    });
  });

  describe('the index page', () => {
    it('is an ordinary child at the content root, where there is no folder to link', () => {
      expect(validate(['index']).isOk()).to.be.true;
    });

    // Below the root it becomes the folder's own link rather than a child, so a position
    // among the children could never be honoured.
    it('cannot be positioned below the content root', () => {
      const nested = { label: 'content/guides/nav.json', isContentRoot: false, childNames: ['index', 'intro'] };

      const errors = errorsFor(['index', 'intro'], nested);

      expect(errors).to.deep.equal([
        "content/guides/nav.json: 'index' is the page this folder opens on, so it cannot be positioned among its " +
          'pages. Remove the entry; the folder itself is positioned by the nav.json one level up.'
      ]);
    });

    it('does not stop the other entries of that file being checked', () => {
      const nested = { label: 'content/guides/nav.json', isContentRoot: false, childNames: ['index', 'intro'] };

      expect(errorsFor(['index', 'nonsense'], nested)).to.have.lengthOf(2);
    });
  });

  describe('the folder title', () => {
    const nested = { label: 'content/guides/nav.json', isContentRoot: false, childNames: ['intro'] };

    it('accepts a name beside the order', () => {
      expect(PortalNavigation.validate('{"title":"Developer Guides","pages":["intro"]}', contextFor(nested)).isOk()).to
        .be.true;
    });

    // Naming a folder is worth a file of its own: the order it would otherwise have to
    // restate is the order Fumadocs already produces.
    it('accepts a name with no order at all', () => {
      expect(PortalNavigation.validate('{"title":"Developer Guides"}', contextFor(nested)).isOk()).to.be.true;
    });

    for (const [description, title] of [
      ['a number', '2'],
      ['an empty string', '""'],
      ['nothing but whitespace', '"   "']
    ]) {
      it(`refuses ${description}`, () => {
        const errors = PortalNavigation.validate(`{"title":${title}}`, contextFor(nested))._unsafeUnwrapErr();

        expect(errors).to.deep.equal(["content/guides/nav.json: 'title' must be a non-empty string."]);
      });
    }

    it('accepts a name at the content root, which names the Home tab', () => {
      expect(PortalNavigation.validate('{"title":"Overview","pages":["index"]}', contextFor()).isOk()).to.be.true;
    });

    // What the CLI names the tabs by, to find two of the same name, as the template trims it.
    it('answers with the name it gives, trimmed', () => {
      const title = (json: string) => PortalNavigation.validate(json, contextFor(nested))._unsafeUnwrap().title;

      expect(title('{"title":"  Developer Guides "}')).to.equal('Developer Guides');
      expect(title('{"pages":["intro"]}')).to.be.undefined;
    });

    // The Home tab gets a fallback home page, so it has something to name without any page.
    it('accepts a name at the content root even with no page in the content directory', () => {
      const context = contextFor({ becomesFolder: false, childNames: ['api'] });

      expect(PortalNavigation.validate('{"title":"Overview"}', context).isOk()).to.be.true;
    });

    it('refuses an empty name at the content root, as anywhere else', () => {
      expect(PortalNavigation.validate('{"title":""}', contextFor())._unsafeUnwrapErr()).to.deep.equal([
        "content/nav.json: 'title' must be a non-empty string."
      ]);
    });

    // The template drops a folder with no page beneath it, so the name would reach nothing --
    // the same silent setting the content root is refused for.
    it('refuses a name in a directory that becomes no folder', () => {
      const context = contextFor({ ...nested, becomesFolder: false });
      const errors = PortalNavigation.validate('{"title":"Tutorials"}', context)._unsafeUnwrapErr();

      expect(errors).to.deep.equal([
        "content/guides/nav.json: 'title' names this folder, but a directory with no page in it or below it is no folder in the sidebar. Add a page, or remove the setting."
      ]);
    });
  });

  describe('the tabs', () => {
    const validateFile = (file: Record<string, unknown>, overrides: Partial<NavigationContext> = {}) =>
      PortalNavigation.validate(JSON.stringify(file), contextFor(overrides));
    const fileErrors = (file: Record<string, unknown>, overrides: Partial<NavigationContext> = {}) =>
      validateFile(file, overrides)._unsafeUnwrapErr();

    // The CLI names the tabs from what it resolved each entry to, in the order the tab bar shows them.
    it('answers with the pages trimmed, and the tabs resolved, in order', () => {
      const settings = validateFile({
        tabs: [' guides ', 'apimatic:api', 'apimatic:sdks'],
        pages: ['  index ', 'authentication']
      });

      expect(settings._unsafeUnwrap()).to.deep.include({
        tabs: [
          { kind: 'folder', name: 'guides' },
          { kind: 'apiReference' },
          { kind: 'generated', section: SDK_SECTION }
        ],
        pages: ['index', 'authentication']
      });
      expect(validateFile({ tabs: ['api'] })._unsafeUnwrap().tabs).to.deep.equal([{ kind: 'apiReference' }]);
      expect(PortalNavigation.validate('{}', contextFor())._unsafeUnwrap()).to.deep.include({
        pages: [],
        tabs: undefined
      });
    });

    it('accepts a folder, api or its token, and each section’s token as a tab', () => {
      expect(validateFile({ tabs: ['guides', 'api', 'apimatic:sdks', 'apimatic:plugin'], pages: ['index'] }).isOk()).to
        .be.true;
      expect(validateFile({ tabs: ['apimatic:api'] }).isOk()).to.be.true;
    });

    // A token in `pages` places its section in Home's sidebar rather than in a tab of its own.
    it('accepts every token and api in pages at the root, which places the section in Home', () => {
      const withApi = { childNames: ['index', 'authentication', 'guides', 'api'] };

      expect(validateFile({ tabs: [], pages: ['index', 'apimatic:sdks', 'api', 'apimatic:plugin'] }, withApi).isOk()).to
        .be.true;
      expect(validateFile({ tabs: ['guides'], pages: ['index', 'apimatic:api'] }).isOk()).to.be.true;
    });

    // The home page belongs to the Home tab, which opens on it.
    it('refuses to make a tab of a folder that serves the home page', () => {
      const withStart = { childNames: ['index', '(start)'], folderNames: ['(start)'], homePageFolders: ['(start)'] };

      expect(fileErrors({ tabs: ['(start)'], pages: ['index'] }, withStart)).to.deep.equal([
        "content/nav.json: '(start)' serves the home page, which belongs to the Home tab, so it cannot be a tab " +
          'of its own. Remove the entry, or move the page out of the folder.'
      ]);
    });

    // In Home, the folder is one more node to order.
    it('accepts a folder that serves the home page in pages, with or without tabs', () => {
      const withStart = { childNames: ['index', '(start)'], folderNames: ['(start)'], homePageFolders: ['(start)'] };

      expect(validateFile({ tabs: [], pages: ['index', '(start)'] }, withStart).isOk()).to.be.true;
      expect(validateFile({ pages: ['(start)', 'index'] }, withStart).isOk()).to.be.true;
    });

    it('refuses a page, and points at pages', () => {
      expect(fileErrors({ tabs: ['authentication'] })).to.deep.equal([
        "content/nav.json: 'authentication' is a page, and a tab is a folder. Order it in Home's sidebar with 'pages' instead."
      ]);
    });

    // A tab for every unlisted folder is the design the file exists to avoid.
    it('refuses the rest entry, even when pages holds it too', () => {
      const sentence =
        "content/nav.json: '...' cannot be a tab, since it would make a tab of every folder 'tabs' does not name. " +
        'Name the folders meant as tabs; the rest stay in Home.';

      expect(fileErrors({ tabs: ['...'] })).to.deep.equal([sentence]);
      expect(fileErrors({ tabs: ['...'], pages: ['index', '...'] })).to.deep.equal([sentence]);
    });

    it('refuses an empty entry, one addressing another directory, and a value that is not an array of strings', () => {
      expect(fileErrors({ tabs: [''] })[0]).to.contain("'tabs' must not contain an empty entry");
      expect(fileErrors({ tabs: ['guides/deep'] })[0]).to.contain("'guides/deep' addresses another directory");
      expect(fileErrors({ tabs: 'guides' })[0]).to.contain("'tabs' must be an array of strings.");
      expect(fileErrors({ tabs: [1] })[0]).to.contain("'tabs' must be an array of strings.");
      // One edit fixes the file: the other list's entries are still checked.
      expect(fileErrors({ tabs: 'guides', pages: ['nope'] })).to.have.lengthOf(2);
      expect(fileErrors({ tabs: ['nope'], pages: 'index' })).to.have.lengthOf(2);
    });

    it('refuses a folder with no page in it, and a name that is no folder with a hint tabs accepts', () => {
      expect(fileErrors({ tabs: ['drafts'] }, { emptyFolders: ['drafts'] })[0]).to.contain(
        "'drafts' is a folder with no page in it or below it"
      );
      expect(fileErrors({ tabs: ['Guides'] })).to.deep.equal([
        "content/nav.json: 'Guides' is not a folder in this directory. Did you mean 'guides'?"
      ]);
      expect(fileErrors({ tabs: ['sdks'] })[0]).to.contain("'apimatic:sdks' makes the SDK pages a tab.");
      expect(fileErrors({ tabs: ['apimatic:sdk'] })[0]).to.contain("'apimatic:sdk' is not a nav.json token");
    });

    // The page lookup strips a stray extension, and the folder lookup has to answer the same way.
    it('matches a folder near miss with a stray extension too', () => {
      expect(fileErrors({ tabs: ['Guides.md'] })).to.deep.equal([
        "content/nav.json: 'Guides.md' is not a folder in this directory. Did you mean 'guides'?"
      ]);
    });

    // The pages hint would send the user to an entry tabs then refuses, one error later.
    it('answers a page near miss with where a page can go, in one message', () => {
      expect(fileErrors({ tabs: ['Authentication'] })).to.deep.equal([
        "content/nav.json: 'Authentication' is not a folder in this directory. 'authentication' is a page, and a " +
          "tab is a folder. Order it in Home's sidebar with 'pages' instead."
      ]);
    });

    it('names both accepted spellings of the reference for a near miss of api', () => {
      expect(fileErrors({ tabs: ['API'] })).to.deep.equal([
        "content/nav.json: 'API' is not a folder in this directory. The API reference is a tab as 'api' " +
          "or 'apimatic:api'."
      ]);
    });

    // `content/api.md` is a second child at the root, so `api` could position only the reference. The
    // token never meant the page, and the scaffold writes it, so a page of that name does not fail the build.
    it('refuses api when a page of that name is a second child, as pages does, and not the token', () => {
      const withApiPage = { childNames: ['index', 'api', 'api'], folderNames: [] };
      const sentence =
        "content/nav.json: 'api' is where the API reference is mounted, so the entry positions the " +
        'reference rather than the page of that name. Rename the page to position it.';

      expect(fileErrors({ tabs: ['api'], pages: ['index'] }, withApiPage)).to.deep.equal([sentence]);
      expect(fileErrors({ tabs: [], pages: ['index', 'api'] }, withApiPage)).to.deep.equal([sentence]);
      expect(validateFile({ tabs: ['apimatic:api'], pages: ['index'] }, withApiPage).isOk()).to.be.true;
      expect(validateFile({ tabs: [], pages: ['index', 'apimatic:api'] }, withApiPage).isOk()).to.be.true;
      expect(validateFile({ tabs: ['api'], pages: ['index'] }, { childNames: ['index', 'api'] }).isOk()).to.be.true;
    });

    it('refuses a repeated entry, however the API reference is spelled', () => {
      expect(fileErrors({ tabs: ['guides', 'guides'] })).to.deep.equal([
        "content/nav.json: 'guides' is listed more than once."
      ]);
      expect(fileErrors({ tabs: ['api', 'apimatic:api'] })).to.deep.equal([
        "content/nav.json: 'api' and 'apimatic:api' both position the API reference; keep one of them."
      ]);
    });

    // A node is either a tab or in Home's sidebar, and the template would have to pick one without a word.
    it('refuses a node named in both lists, however it is spelled', () => {
      expect(fileErrors({ tabs: ['guides'], pages: ['index', 'guides'] })).to.deep.equal([
        "content/nav.json: 'guides' is in both 'pages' and 'tabs', and a node is either a tab or in Home's sidebar. " +
          'Keep one of them.'
      ]);
      expect(fileErrors({ tabs: ['apimatic:api'], pages: ['api'] }, { childNames: ['index', 'api'] })).to.deep.equal([
        "content/nav.json: 'api' in 'pages' and 'apimatic:api' in 'tabs' both position the API reference, and a node " +
          "is either a tab or in Home's sidebar. Keep one of them."
      ]);
    });

    it('reports every bad entry of both lists at once', () => {
      expect(fileErrors({ tabs: ['nope', 'authentication'], pages: ['also-nope'] })).to.have.lengthOf(3);
    });

    describe('below the content root', () => {
      const nested = {
        label: 'content/guides/nav.json',
        isContentRoot: false,
        childNames: ['intro', 'deep'],
        folderNames: ['deep']
      };

      // The tabs are decided at the top of the content directory; nothing reads the setting anywhere else.
      it('refuses the setting with a sentence of its own, and checks nothing in it', () => {
        expect(fileErrors({ tabs: ['nonsense'], pages: ['intro'] }, nested)).to.deep.equal([
          "content/guides/nav.json: 'tabs' is only read in the nav.json at the top of the content directory, where the " +
            "tabs are decided. Remove it here; this file orders its own folder with 'pages'."
        ]);
      });

      it('keeps listing pages and title as the settings for anything else unknown', () => {
        expect(fileErrors({ tab: ['deep'] }, nested)).to.deep.equal([
          "content/guides/nav.json: 'tab' is not a nav.json setting. The settings are 'pages' and 'title'."
        ]);
      });
    });

    it('lists tabs among the settings at the root, so a misspelt one is pointed at it', () => {
      expect(fileErrors({ tab: ['guides'], pages: ['index'] })).to.deep.equal([
        "content/nav.json: 'tab' is not a nav.json setting. The settings are 'pages', 'title' and 'tabs'."
      ]);
    });

    // `tabs` is the whole tab bar after Home, so a file without it makes no tab, whatever `pages`
    // names; it answers with no list, so the content tree can say so once.
    it('accepts a root file with no tabs, whatever pages names, and answers with no list', () => {
      const settings = validateFile({ pages: ['index', 'guides', 'apimatic:api', 'authentication'] });

      expect(settings._unsafeUnwrap()).to.deep.include({
        tabs: undefined,
        pages: ['index', 'guides', 'apimatic:api', 'authentication']
      });
      expect(validateFile({ pages: ['api'] }, { childNames: ['index', 'api'] }).isOk()).to.be.true;
      expect(validateFile({ title: 'Overview' }).isOk()).to.be.true;
    });

    // Fumadocs' own key for a tab; here, listing the folder in the content root's tabs makes one.
    it('reports a root setting as unknown', () => {
      const tutorials = { label: 'content/tutorials/nav.json', isContentRoot: false, childNames: ['first-call'] };

      expect(PortalNavigation.validate('{"root":true}', contextFor(tutorials))._unsafeUnwrapErr()).to.deep.equal([
        "content/tutorials/nav.json: 'root' is not a nav.json setting. The settings are 'pages' and 'title'."
      ]);
    });

    // A tab lists its index page first whatever the file says, so the entry would position
    // nothing -- in the reference's tab as in any other folder.
    it('refuses the index page in the API reference too', () => {
      const api = { label: 'content/api/nav.json', isContentRoot: false, isApiDirectory: true, childNames: ['index'] };

      expect(errorsFor(['index'], api)[0]).to.contain("'index' is the page this folder opens on");
    });
  });

  // `JSON.parse` will happily hand back a document keyed by a prototype member.
  describe('fields named after Object.prototype members', () => {
    for (const field of ['toString', 'constructor', 'hasOwnProperty']) {
      it(`reports '${field}' as unknown without quoting a prototype member back`, () => {
        const errors = PortalNavigation.validate(`{"${field}":"x"}`, contextFor())._unsafeUnwrapErr();

        expect(errors).to.deep.equal([
          `content/nav.json: '${field}' is not a nav.json setting. The settings are 'pages', 'title' and 'tabs'.`
        ]);
        expect(errors[0]).to.not.contain('native code');
      });
    }
  });
});
