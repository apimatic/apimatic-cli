import { expect } from 'chai';
import { NavigationContext, PortalNavigation } from '../../../src/types/portal/portal-navigation';

describe('PortalNavigation', () => {
  const contextFor = (overrides: Partial<NavigationContext> = {}): NavigationContext => ({
    label: 'content/nav.json',
    isContentRoot: true,
    childNames: ['index', 'authentication', 'guides'],
    ...overrides
  });

  const parse = (pages: unknown, overrides: Partial<NavigationContext> = {}) =>
    PortalNavigation.parse(JSON.stringify({ pages }), contextFor(overrides));

  const errorsFor = (pages: unknown, overrides: Partial<NavigationContext> = {}) =>
    parse(pages, overrides)._unsafeUnwrapErr();

  describe('entries it accepts', () => {
    it('reads pages, tokens and the rest entry in the order given', () => {
      const navigation = parse(['index', 'apimatic:pages', 'authentication', '...', 'apimatic:api'])._unsafeUnwrap();

      expect(navigation.order()).to.deep.equal([
        { kind: 'child', name: 'index' },
        { kind: 'injectedPages' },
        { kind: 'child', name: 'authentication' },
        { kind: 'rest' },
        { kind: 'apiReference' }
      ]);
    });

    it('accepts a subfolder by name', () => {
      expect(parse(['guides'])._unsafeUnwrap().order()).to.deep.equal([{ kind: 'child', name: 'guides' }]);
    });

    // The SDK page ships in a later change; a nav.json written today has to keep working.
    it('accepts the injected-pages token while it resolves to nothing', () => {
      expect(parse(['apimatic:pages'])._unsafeUnwrap().order()).to.deep.equal([{ kind: 'injectedPages' }]);
    });

    it('treats a file with no pages as ordering nothing', () => {
      expect(PortalNavigation.parse('{}', contextFor())._unsafeUnwrap().order()).to.deep.equal([]);
    });

    it('reads a file written with a byte-order mark', () => {
      const mark = '﻿';
      const navigation = PortalNavigation.parse(mark + '{"pages":["index"]}', contextFor())._unsafeUnwrap();

      expect(navigation.order()).to.deep.equal([{ kind: 'child', name: 'index' }]);
    });

    it('ignores surrounding whitespace in an entry', () => {
      expect(parse(['  index  '])._unsafeUnwrap().order()).to.deep.equal([{ kind: 'child', name: 'index' }]);
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

    it('names the file when the JSON is broken', () => {
      expect(PortalNavigation.parse('{', contextFor())._unsafeUnwrapErr()).to.deep.equal([
        'content/nav.json is not valid JSON.'
      ]);
    });

    it('refuses a document that is not an object', () => {
      expect(PortalNavigation.parse('[]', contextFor())._unsafeUnwrapErr()).to.deep.equal([
        'content/nav.json must contain a JSON object.'
      ]);
    });

    it('names an unknown setting, and suggests pages for a near miss', () => {
      const context = contextFor();

      expect(PortalNavigation.parse('{"order":["index"]}', context)._unsafeUnwrapErr()[0]).to.contain(
        "'order' is not a nav.json setting; did you mean 'pages'?"
      );
      expect(PortalNavigation.parse('{"colour":"red"}', context)._unsafeUnwrapErr()).to.deep.equal([
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
      expect(
        parse(['intro'], { ...nested, childNames: ['intro'] })
          ._unsafeUnwrap()
          .order()
      ).to.deep.equal([{ kind: 'child', name: 'intro' }]);
    });
  });

  describe('the index page', () => {
    it('is an ordinary child at the content root, where there is no folder to link', () => {
      expect(parse(['index'])._unsafeUnwrap().order()).to.deep.equal([{ kind: 'child', name: 'index' }]);
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
    const errors = PortalNavigation.parse('{"title":"Guides","pages":["index"]}', contextFor())._unsafeUnwrapErr();

    expect(errors).to.have.lengthOf(1);
    expect(errors[0]).to.contain("'title' is not a nav.json setting");
    expect(errors[0]).to.contain('named after its directory');
    expect(errors[0]).to.not.contain('did you mean');
  });

  // `JSON.parse` will happily hand back a document keyed by a prototype member.
  describe('fields named after Object.prototype members', () => {
    for (const field of ['toString', 'constructor', 'hasOwnProperty']) {
      it(`reports '${field}' as unknown without quoting a prototype member back`, () => {
        const errors = PortalNavigation.parse(`{"${field}":"x"}`, contextFor())._unsafeUnwrapErr();

        expect(errors).to.deep.equal([`content/nav.json: '${field}' is not a nav.json setting.`]);
        expect(errors[0]).to.not.contain('native code');
      });
    }
  });
});
