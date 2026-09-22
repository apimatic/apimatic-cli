import { expect } from 'chai';
import { NavigationContext, PortalNavigation } from '../../../src/types/portal/portal-navigation';

describe('PortalNavigation', () => {
  const contextFor = (overrides: Partial<NavigationContext> = {}): NavigationContext => ({
    label: 'content/nav.json',
    isContentRoot: true,
    childNames: ['index', 'authentication', 'guides'],
    ...overrides
  });

  const validate = (pages: unknown, overrides: Partial<NavigationContext> = {}) =>
    PortalNavigation.validate(JSON.stringify({ pages }), contextFor(overrides));

  const errorsFor = (pages: unknown, overrides: Partial<NavigationContext> = {}) =>
    validate(pages, overrides)._unsafeUnwrapErr();

  describe('entries it accepts', () => {
    it('accepts pages, both tokens and the rest entry together', () => {
      expect(validate(['index', 'apimatic:pages', 'authentication', '...', 'apimatic:api']).isOk()).to.be.true;
    });

    it('accepts a subfolder by name', () => {
      expect(validate(['guides']).isOk()).to.be.true;
    });

    // The SDK page ships in a later change; a nav.json written today has to keep working.
    it('accepts the injected-pages token while it resolves to nothing', () => {
      expect(validate(['apimatic:pages']).isOk()).to.be.true;
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

    // The entries a renamed meta.json carries across, each explained rather than reported as
    // a page that does not exist.
    it('recognises Fumadocs meta.json entry syntax and says what nav.json does instead', () => {
      for (const entry of [
        '---',
        '---Guides---',
        '[Status](https://status.example.com)',
        '!draft',
        '...guides',
        'z...a'
      ]) {
        const [error] = errorsFor([entry]);

        expect(error, entry).to.contain(`'${entry}' is Fumadocs meta.json syntax, which nav.json does not read.`);
        expect(error, entry).to.contain("'...' stands for the rest");
      }
    });

    it('points api at the token, since that is where the reference is mounted', () => {
      expect(errorsFor(['api'])).to.deep.equal([
        "content/nav.json: 'api' is not a page or folder in this directory. The API reference is positioned with 'apimatic:api'."
      ]);
    });

    // `content/api` is the reference's mount point, so the node there is the reference even
    // when the user keeps pages of their own beside it. One spelling positions it.
    it('refuses api at the root even when a directory of that name holds the user’s pages', () => {
      expect(errorsFor(['api', 'index'], { childNames: ['index', 'api'] })).to.deep.equal([
        "content/nav.json: 'api' is where the API reference is mounted, so it is positioned with 'apimatic:api' rather than by name."
      ]);
    });

    // The mount point is one node however the directory came to exist, so the answer cannot
    // depend on which of the two put it there.
    it('refuses api at the root when a page of that name is a second child', () => {
      const errors = errorsFor(['index', 'api'], { childNames: ['index', 'api', 'api'] });

      expect(errors).to.have.lengthOf(1);
      expect(errors[0]).to.contain("'api' is where the API reference is mounted");
      expect(errors[0]).to.contain("A page called 'api' cannot be positioned at all; rename it.");
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

    it('names an unknown setting, and suggests pages for a near miss', () => {
      const context = contextFor();

      expect(PortalNavigation.validate('{"order":["index"]}', context)._unsafeUnwrapErr()[0]).to.contain(
        "'order' is not a nav.json setting; did you mean 'pages'?"
      );
      expect(PortalNavigation.validate('{"colour":"red"}', context)._unsafeUnwrapErr()).to.deep.equal([
        "content/nav.json: 'colour' is not a nav.json setting."
      ]);
    });
  });

  describe('tokens outside the content root', () => {
    const nested = { label: 'content/guides/nav.json', isContentRoot: false, childNames: ['index'] };

    it('refuses both tokens, because the nodes they position live at the root', () => {
      for (const token of ['apimatic:api', 'apimatic:pages']) {
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

      expect(errors).to.have.lengthOf(1);
      expect(errors[0]).to.contain("'index' is the page this folder links to");
    });

    it('does not stop the other entries of that file being checked', () => {
      const nested = { label: 'content/guides/nav.json', isContentRoot: false, childNames: ['index', 'intro'] };

      expect(errorsFor(['index', 'nonsense'], nested)).to.have.lengthOf(2);
    });
  });

  // The warning about a leftover meta.json asks the user to rename it. Whoever does that
  // carries its Fumadocs keys across, and calling those a misspelling of 'pages' would be
  // a dead end.
  it('explains a Fumadocs folder-metadata key rather than calling it a typo', () => {
    const errors = PortalNavigation.validate('{"icon":"book","pages":["index"]}', contextFor())._unsafeUnwrapErr();

    expect(errors).to.have.lengthOf(1);
    expect(errors[0]).to.contain("'icon' is not a nav.json setting");
    expect(errors[0]).to.contain("the order of pages and a folder's title");
    expect(errors[0]).to.not.contain('did you mean');
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

    // The root is no folder in the sidebar, so a name given here would set nothing, which is
    // the silent wrongness this file exists to refuse.
    it('refuses a name at the content root, naming where the portal is titled instead', () => {
      const errors = PortalNavigation.validate('{"title":"My API","pages":["index"]}', contextFor())._unsafeUnwrapErr();

      expect(errors).to.have.lengthOf(1);
      expect(errors[0]).to.contain('orders the content root, which is not one');
      expect(errors[0]).to.contain('portal.json');
    });

    it('suggests it for the names a toc.yml or a meta.json used', () => {
      for (const field of ['group', 'name', 'label']) {
        const errors = PortalNavigation.validate(`{"${field}":"Guides"}`, contextFor(nested))._unsafeUnwrapErr();

        expect(errors[0], field).to.contain(`'${field}' is not a nav.json setting; did you mean 'title'?`);
      }
    });
  });

  // `JSON.parse` will happily hand back a document keyed by a prototype member.
  describe('fields named after Object.prototype members', () => {
    for (const field of ['toString', 'constructor', 'hasOwnProperty']) {
      it(`reports '${field}' as unknown without quoting a prototype member back`, () => {
        const errors = PortalNavigation.validate(`{"${field}":"x"}`, contextFor())._unsafeUnwrapErr();

        expect(errors).to.deep.equal([`content/nav.json: '${field}' is not a nav.json setting.`]);
        expect(errors[0]).to.not.contain('native code');
      });
    }
  });
});
