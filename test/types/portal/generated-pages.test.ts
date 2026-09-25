import { posix } from 'node:path';
import { expect } from 'chai';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FileName } from '../../../src/types/file/fileName';
import { FilePath } from '../../../src/types/file/filePath';
import { UrlPath } from '../../../src/types/file/urlPath';
import { CodeSampleCatalogs } from '../../../src/types/portal/code-samples';
import {
  GENERATED_DIRECTORY_NAME,
  GeneratedPages,
  PLUGIN_SECTION,
  PluginSource,
  SDK_SECTION
} from '../../../src/types/portal/generated-pages';
import { sdkDocsPath } from '../../../src/types/portal/page-fragments';
import { PageRecord } from '../../../src/types/portal/page-template';
import { PortalArtifacts } from '../../../src/types/portal/portal-artifacts';
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
        registry: 'npm',
        docs: '../../generated-includes/sdk-docs/typescript.md'
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
        registry: '',
        docs: '../../generated-includes/sdk-docs/csharp.md'
      });
    });

    it('is on the SDKs page for every language, in order', () => {
      const [index, typescript, python] = pagesFor({ typescript: PUBLISHED_TYPESCRIPT, python: {} }).pages();
      const cards = index.data.sdks as readonly PageRecord[];

      expect(cards.map((card) => card.language)).to.deep.equal(['typescript', 'python']);
      expect(typescript.data).to.deep.include(cards[0]);
      expect(python.data).to.deep.include(cards[1]);
    });

    // Worked out from where the page and the docs are written, rather than written into the template.
    it('includes its SDK docs from where they are written, relative to the page', () => {
      const [, page] = pagesFor({ python: {} }).pages();

      expect(posix.join(GENERATED_DIRECTORY_NAME, SDK_SECTION.folder, `${page.data.docs}`)).to.equal(
        sdkDocsPath('python')
      );
    });

    // Each value lands in a double-quoted JSX attribute, whose entities MDX decodes.
    it('writes a double quote and an ampersand from the configuration so each reads back as written', () => {
      const [, page] = pagesFor({
        python: { publishing: { package: { version: '1.0"' }, packageConfiguration: { name: 'calc&amp;co' } } }
      }).pages();

      expect(page.data.version).to.equal('1.0&quot;');
      expect(page.data.packageName).to.equal('calc&amp;amp;co');
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

  describe('what the artifacts leave out', () => {
    const delivered = new DirectoryPath('artifacts');
    const artifactsWith = (sdks: string[], docs: string[], plugin: boolean) =>
      new PortalArtifacts(
        new CodeSampleCatalogs([]),
        new Map(sdks.map((language) => [language, new FilePath(delivered, new FileName(`${language}.zip`))])),
        new Map(docs.map((language) => [language, '## Installation'])),
        plugin ? new FilePath(delivered, new FileName('plugin.zip')) : undefined
      );

    it('is nothing when every page is backed', () => {
      const pages = pagesFor({ typescript: {}, python: {} }, { kind: 'bundled' });

      expect(pages.missingFrom(artifactsWith(['typescript', 'python'], ['typescript', 'python'], true))).to.be.null;
    });

    // Apart, so the message points at the file that is missing rather than at the SDK for both.
    it('names the languages missing their SDK, and those missing their SDK docs, each in order', () => {
      const pages = pagesFor({ csharp: {}, typescript: {}, python: {} });

      expect(pages.missingFrom(artifactsWith(['csharp', 'python'], ['csharp', 'typescript'], false))).to.deep.equal({
        sdks: ['typescript'],
        sdkDocs: ['python'],
        plugin: false
      });
    });

    it('names a bundled plugin the portal has no copy of, but needs none for a hosted one', () => {
      const hosted: PluginSource = { kind: 'hosted', url: new UrlPath('https://plugins.acme.test/calc.zip') };
      const artifacts = artifactsWith(['typescript'], ['typescript'], false);

      expect(pagesFor({ typescript: {} }, { kind: 'bundled' }).missingFrom(artifacts)).to.deep.equal({
        sdks: [],
        sdkDocs: [],
        plugin: true
      });
      expect(pagesFor({ typescript: {} }, hosted).missingFrom(artifacts)).to.be.null;
    });

    // What `/portal-artifacts` delivers beyond the pages, such as a language removed since, backs nothing.
    it('ignores what the artifacts carry that no page asks for', () => {
      expect(pagesFor({ typescript: {} }).missingFrom(artifactsWith(['typescript', 'go'], ['typescript', 'go'], true)))
        .to.be.null;
    });
  });

  it('writes each nav.json as the build reads it, ending in a newline', () => {
    const [file] = pagesFor({ typescript: {} }).navigationFiles();

    expect(file.contents).to.equal('{\n  "title": "SDKs",\n  "pages": [\n    "typescript"\n  ]\n}\n');
  });
});
