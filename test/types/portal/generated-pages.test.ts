import { expect } from 'chai';
import { UrlPath } from '../../../src/types/file/urlPath';
import { GeneratedPages, PLUGIN_SECTION, PluginSource, SDK_SECTION } from '../../../src/types/portal/generated-pages';
import { PortalLanguages } from '../../../src/types/portal/portal-languages';
import { Language, LANGUAGE_NAMES } from '../../../src/types/sdk/generate';

describe('GeneratedPages', () => {
  const pagesFor = (languages: Record<string, object>, plugin: PluginSource | null = null) =>
    GeneratedPages.of(PortalLanguages.fromBlock(languages, [])._unsafeUnwrap(), plugin);

  /** Each page as the folder and file it is written to, with the template it comes from. */
  const written = (pages: GeneratedPages) =>
    pages.pages().map((page) => `${page.section.folder}/${page.fileName} <- ${page.template}`);

  const navigation = (pages: GeneratedPages) =>
    pages.navigationFiles().map((file) => [file.section.folder, JSON.parse(file.contents)]);

  const PUBLISHED_TYPESCRIPT = {
    publishing: {
      source: { repositoryUrl: 'https://github.com/acme/calc-ts' },
      package: { version: '1.2.0' },
      packageConfiguration: { name: '@acme/calc' }
    }
  };

  it('gives the SDKs page and one page per language', () => {
    expect(written(pagesFor({ typescript: {} }))).to.deep.equal([
      'sdks/index.mdx <- sdks',
      'sdks/typescript.mdx <- sdk'
    ]);
  });

  // `sdk publish` appends, and the user reorders by editing the block.
  it('keeps the languages in the order the block lists them', () => {
    const pages = pagesFor({ python: {}, csharp: {}, typescript: {} });

    expect(written(pages).slice(1)).to.deep.equal([
      'sdks/python.mdx <- sdk',
      'sdks/csharp.mdx <- sdk',
      'sdks/typescript.mdx <- sdk'
    ]);
    expect(navigation(pages)).to.deep.equal([['sdks', { title: 'SDKs', pages: ['python', 'csharp', 'typescript'] }]]);
  });

  describe('the card for a language', () => {
    it('carries everything a published language records, and its fixed addresses', () => {
      const [, page] = pagesFor({ typescript: PUBLISHED_TYPESCRIPT }).pages();

      expect(page.data).to.deep.equal({
        language: 'typescript',
        name: 'TypeScript',
        page: '/sdks/typescript',
        download: '/__downloads/sdk/typescript.zip',
        source: 'https://github.com/acme/calc-ts',
        version: '1.2.0',
        packageName: '@acme/calc',
        packageUrl: 'https://www.npmjs.com/package/@acme/calc',
        registry: 'npm'
      });
    });

    // The template's attribute list is fixed; the component hides what is empty.
    it('leaves every field it has nothing for empty, but always offers the download', () => {
      const [, page] = pagesFor({ csharp: {} }).pages();

      expect(page.data).to.deep.equal({
        language: 'csharp',
        name: 'C#',
        page: '/sdks/csharp',
        download: '/__downloads/sdk/csharp.zip',
        source: '',
        version: '',
        packageName: '',
        packageUrl: '',
        registry: ''
      });
    });

    it('is on the SDKs page for every language, in order', () => {
      const [index, typescript, python] = pagesFor({ typescript: PUBLISHED_TYPESCRIPT, python: {} }).pages();

      expect(index.data).to.deep.equal({ sdks: [typescript.data, python.data] });
    });

    // Each value lands in a double-quoted JSX attribute.
    it('writes a double quote from the configuration so it cannot end the attribute', () => {
      const [, page] = pagesFor({
        python: { publishing: { package: { version: '1.0"' }, packageConfiguration: { name: 'calc' } } }
      }).pages();

      expect(page.data.version).to.equal('1.0&quot;');
    });
  });

  it('has a display name for every language', () => {
    for (const language of Object.values(Language)) {
      expect(LANGUAGE_NAMES[language], language).to.be.a('string').and.not.be.empty;
    }
  });

  describe('the context plugin', () => {
    it('gets a folder of its own, with its index page and a titled nav.json, when there is a plugin', () => {
      const pages = pagesFor({ typescript: {} }, { kind: 'bundled' });

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

    it('installs the bundled copy from where the portal offers it, listing every language', () => {
      const plugin = pagesFor({ python: {}, csharp: {} }, { kind: 'bundled' }).pages().at(-1);

      expect(plugin?.data).to.deep.equal({
        installPath: '/__downloads/plugin.zip',
        languages: [
          { language: 'python', name: 'Python' },
          { language: 'csharp', name: 'C#' }
        ]
      });
    });

    it('installs from the address the author gives when it is hosted elsewhere', () => {
      const url = new UrlPath('https://plugins.acme.test/calc.zip');
      const plugin = pagesFor({ typescript: {} }, { kind: 'hosted', url }).pages().at(-1);

      expect(plugin?.data.installPath).to.equal('https://plugins.acme.test/calc.zip');
    });
  });

  it('writes each nav.json as the build reads it, ending in a newline', () => {
    const [file] = pagesFor({ typescript: {} }).navigationFiles();

    expect(file.contents).to.equal('{\n  "title": "SDKs",\n  "pages": [\n    "typescript"\n  ]\n}\n');
  });
});
