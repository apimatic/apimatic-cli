import { expect } from 'chai';
import { GeneratedPages, PLUGIN_SECTION, SDK_SECTION } from '../../../src/types/portal/generated-pages';
import { PortalLanguages } from '../../../src/types/portal/portal-languages';
import { Language, LANGUAGE_NAMES } from '../../../src/types/sdk/generate';

describe('GeneratedPages', () => {
  const pagesFor = (languages: Record<string, object>, plugin = false) =>
    GeneratedPages.of(PortalLanguages.fromBlock(languages, [])._unsafeUnwrap(), plugin);

  /** Each page as the folder and file it is written to, with the template it comes from. */
  const written = (pages: GeneratedPages) =>
    pages.pages().map((page) => `${page.section.folder}/${page.fileName} <- ${page.template}`);

  const navigation = (pages: GeneratedPages) =>
    pages.navigationFiles().map((file) => [file.section.folder, JSON.parse(file.contents)]);

  it('gives the SDKs page and one page per language', () => {
    expect(written(pagesFor({ typescript: {} }))).to.deep.equal([
      'sdks/index.mdx <- sdks',
      'sdks/typescript.mdx <- sdk'
    ]);
  });

  // `sdk publish` appends, and the user reorders by editing the block.
  it('keeps the languages in the order the block lists them', () => {
    const pages = pagesFor({ python: {}, csharp: {}, go: {} });

    expect(written(pages).slice(1)).to.deep.equal([
      'sdks/python.mdx <- sdk',
      'sdks/csharp.mdx <- sdk',
      'sdks/go.mdx <- sdk'
    ]);
    expect(navigation(pages)).to.deep.equal([['sdks', { title: 'SDKs', pages: ['python', 'csharp', 'go'] }]]);
  });

  it('gives each language page the language and its display name', () => {
    const [, page] = pagesFor({ csharp: {} }).pages();

    expect(page.data).to.deep.equal({ language: 'csharp', name: 'C#' });
  });

  it('gives the SDKs page no data yet', () => {
    expect(pagesFor({ typescript: {} }).pages()[0].data).to.deep.equal({});
  });

  it('has a display name for every language', () => {
    for (const language of Object.values(Language)) {
      expect(LANGUAGE_NAMES[language], language).to.be.a('string').and.not.be.empty;
    }
  });

  describe('the context plugin', () => {
    it('gets a folder of its own, with its index page and a titled nav.json, when there is a plugin block', () => {
      const pages = pagesFor({ typescript: {} }, true);

      expect(written(pages)).to.deep.equal([
        'sdks/index.mdx <- sdks',
        'sdks/typescript.mdx <- sdk',
        'context-plugin/index.mdx <- context-plugin'
      ]);
      expect(navigation(pages)).to.deep.equal([
        ['sdks', { title: 'SDKs', pages: ['typescript'] }],
        ['context-plugin', { title: 'Context Plugin' }]
      ]);
      expect(pages.sections()).to.deep.equal([SDK_SECTION, PLUGIN_SECTION]);
    });

    it('gets nothing without one', () => {
      const pages = pagesFor({ typescript: {} });

      expect(pages.pages().some((page) => page.section === PLUGIN_SECTION)).to.be.false;
      expect(pages.sections()).to.deep.equal([SDK_SECTION]);
    });
  });

  it('writes each nav.json as the build reads it, ending in a newline', () => {
    const [file] = pagesFor({ typescript: {} }).navigationFiles();

    expect(file.contents).to.equal('{\n  "title": "SDKs",\n  "pages": [\n    "typescript"\n  ]\n}\n');
  });
});
