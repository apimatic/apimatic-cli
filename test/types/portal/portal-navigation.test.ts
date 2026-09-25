import { expect } from 'chai';
import { NavigationContext, PortalNavigation } from '../../../src/types/portal/portal-navigation';

describe('PortalNavigation', () => {
  const contextFor = (overrides: Partial<NavigationContext> = {}): NavigationContext => ({
    label: 'content/nav.json',
    isContentRoot: true,
    isApiDirectory: false,
    becomesFolder: true,
    childNames: ['index', 'authentication', 'guides'],
    emptyFolders: [],
    homePageFolders: [],
    ...overrides
  });

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

    it('points api at the token, since that is where the reference is mounted', () => {
      expect(errorsFor(['api'])).to.deep.equal([
        "content/nav.json: 'api' is not a page or folder in this directory. The API reference is positioned with 'apimatic:api'."
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
        "content/nav.json: 'colour' is not a nav.json setting. The settings are 'pages' and 'title'."
      ]);
    });
  });

  describe('tokens outside the content root', () => {
    const nested = { label: 'content/guides/nav.json', isContentRoot: false, childNames: ['index'] };

    it('refuses every token, because the nodes they position live at the root', () => {
      for (const token of ['apimatic:api', 'apimatic:sdks', 'apimatic:plugin']) {
        const errors = errorsFor([token], nested);

        expect(errors).to.have.lengthOf(1);
        expect(errors[0]).to.contain(`'${token}' can only be used in the nav.json at the top`);
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
    // The walk makes a tab of each folder the content root's entries name.
    it('answers with its entries, trimmed', () => {
      expect(validate(['  index ', 'guides'])._unsafeUnwrap().pages).to.deep.equal(['index', 'guides']);
      expect(PortalNavigation.validate('{}', contextFor())._unsafeUnwrap().pages).to.deep.equal([]);
    });

    // The home page belongs to the Home tab, which opens on it.
    it('refuses to make a tab of a folder that serves the home page', () => {
      const withStart = { childNames: ['index', '(start)'], homePageFolders: ['(start)'] };

      expect(errorsFor(['index', '(start)'], withStart)).to.deep.equal([
        "content/nav.json: '(start)' serves the home page, which belongs to the Home tab, so it cannot be a tab " +
          'of its own. Remove the entry, or move the page out of the folder.'
      ]);
    });

    // Listing the folder in the content root's file is what makes a tab now.
    it('reports the root setting that used to make one as unknown', () => {
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
          `content/nav.json: '${field}' is not a nav.json setting. The settings are 'pages' and 'title'.`
        ]);
        expect(errors[0]).to.not.contain('native code');
      });
    }
  });
});
