import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import sinon from 'sinon';
import { envInfo } from '../../src/infrastructure/env-info';
import { FileService } from '../../src/infrastructure/file-service';
import { PortalPagesService } from '../../src/infrastructure/portal-pages-service';
import { DirectoryPath } from '../../src/types/file/directoryPath';
import { GeneratedPages } from '../../src/types/portal/generated-pages';
import { PortalLanguages } from '../../src/types/portal/portal-languages';
import { PLUGIN_LANGUAGES } from '../../src/types/sdk/generate';

describe('PortalPagesService', () => {
  const service = new PortalPagesService();
  let root: string;
  let generated: DirectoryPath;

  const pagesFor = (languages: Record<string, object> = { typescript: {} }, plugin = false) =>
    GeneratedPages.of(PortalLanguages.fromBlock(languages, [])._unsafeUnwrap(), plugin ? { kind: 'bundled' } : null);

  /** Every file written, relative to the generated directory. */
  const files = () =>
    fs
      .readdirSync(generated.toString(), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) =>
        path.relative(generated.toString(), path.join(entry.parentPath, entry.name)).split(path.sep).join('/')
      )
      .sort();

  const read = (relative: string) => fs.readFileSync(path.join(generated.toString(), relative), 'utf8');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-pages-'));
    generated = new DirectoryPath(root).join('generated');
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes each page and nav.json into its section folder, and says so', async () => {
    expect((await service.write(generated, pagesFor({ typescript: {} }, true)))._unsafeUnwrap()).to.be.true;

    expect(files()).to.deep.equal([
      'context-plugin/index.mdx',
      'context-plugin/nav.json',
      'sdks/index.mdx',
      'sdks/nav.json',
      'sdks/typescript.mdx'
    ]);
    expect(JSON.parse(read('sdks/nav.json'))).to.deep.equal({ title: 'SDKs', pages: ['typescript'] });
  });

  // The one run that holds the shipped templates and the data the generator gives them together.
  it('renders every page from the shipped templates, leaving no placeholder behind', async () => {
    const everyLanguage = Object.fromEntries(PLUGIN_LANGUAGES.map((language) => [language, {}]));

    (await service.write(generated, pagesFor(everyLanguage, true)))._unsafeUnwrap();

    for (const file of files().filter((name) => name.endsWith('.mdx'))) {
      expect(read(file), file).to.not.contain('{{');
    }
    expect(read('sdks/csharp.mdx')).to.contain('title: "C# SDK"');
    expect(read('sdks/csharp.mdx')).to.contain('<include>../../generated-includes/sdk-docs/csharp.md</include>');
    for (const language of PLUGIN_LANGUAGES) {
      expect(read('sdks/index.mdx')).to.contain(`<SdkCard language="${language}"`);
      expect(read('context-plugin/index.mdx')).to.contain(`<PluginLanguage language="${language}"`);
    }
    expect(read('context-plugin/index.mdx')).to.contain('<PluginInstall path="/__downloads/plugin.zip" />');
  });

  // What the user's `apimatic.json` records reaches the page as it was written, but for a quote.
  it('writes a published language into its card and its page', async () => {
    const published = {
      publishing: {
        source: { repositoryUrl: 'https://github.com/acme/calc-ts' },
        package: { version: '1.2.0' },
        packageConfiguration: { name: '@acme/calc' }
      }
    };

    (await service.write(generated, pagesFor({ typescript: published })))._unsafeUnwrap();

    expect(read('sdks/index.mdx')).to.contain(
      '<SdkCard language="typescript" name="TypeScript" page="/sdks/typescript" ' +
        'download="/__downloads/sdk/typescript.zip" source="https://github.com/acme/calc-ts" ' +
        'packageName="@acme/calc" packageUrl="https://www.npmjs.com/package/@acme/calc" registry="npm" version="1.2.0" />'
    );
    expect(read('sdks/typescript.mdx')).to.contain(
      '<SdkActions download="/__downloads/sdk/typescript.zip" source="https://github.com/acme/calc-ts" ' +
        'packageUrl="https://www.npmjs.com/package/@acme/calc" registry="npm" />'
    );
  });

  // The dev server watches the directory, and could read a page truncated before it is written.
  it('replaces each file whole rather than writing it in place', async () => {
    const replace = sinon.spy(FileService.prototype, 'replaceContents');
    const write = sinon.spy(FileService.prototype, 'writeContents');

    (await service.write(generated, pagesFor()))._unsafeUnwrap();

    expect(replace.callCount).to.equal(files().length);
    expect(write.called).to.be.false;
  });

  it('writes nothing, and says so, when the pages are the same', async () => {
    (await service.write(generated, pagesFor()))._unsafeUnwrap();
    const before = fs.statSync(path.join(generated.toString(), 'sdks/typescript.mdx')).mtimeMs;

    expect((await service.write(generated, pagesFor()))._unsafeUnwrap()).to.be.false;
    expect(fs.statSync(path.join(generated.toString(), 'sdks/typescript.mdx')).mtimeMs).to.equal(before);
  });

  it('deletes the page of a language removed, and reorders the rest', async () => {
    (await service.write(generated, pagesFor({ typescript: {}, python: {} })))._unsafeUnwrap();

    expect((await service.write(generated, pagesFor({ python: {} })))._unsafeUnwrap()).to.be.true;

    expect(files()).to.deep.equal(['sdks/index.mdx', 'sdks/nav.json', 'sdks/python.mdx']);
    expect(JSON.parse(read('sdks/nav.json')).pages).to.deep.equal(['python']);
  });

  it('deletes the context plugin folder when the block goes, and writes it again when it returns', async () => {
    (await service.write(generated, pagesFor({ typescript: {} }, true)))._unsafeUnwrap();

    expect((await service.write(generated, pagesFor()))._unsafeUnwrap()).to.be.true;
    expect(fs.existsSync(path.join(generated.toString(), 'context-plugin'))).to.be.false;

    expect((await service.write(generated, pagesFor({ typescript: {} }, true)))._unsafeUnwrap()).to.be.true;
    expect(files()).to.include('context-plugin/index.mdx');
  });

  it('deletes anything else in the directory, which only it writes', async () => {
    fs.mkdirSync(path.join(generated.toString(), 'sdks'), { recursive: true });
    fs.writeFileSync(path.join(generated.toString(), 'stray.mdx'), '# Stray');
    fs.writeFileSync(path.join(generated.toString(), 'sdks', 'ruby.mdx'), '# Ruby');

    (await service.write(generated, pagesFor()))._unsafeUnwrap();

    expect(files()).to.deep.equal(['sdks/index.mdx', 'sdks/nav.json', 'sdks/typescript.mdx']);
  });

  describe('when the templates are not what the pages need', () => {
    const templates = () => path.join(root, 'package', 'portal-pages');

    beforeEach(() => {
      fs.mkdirSync(templates(), { recursive: true });
      sinon.stub(envInfo, 'packageRoot').returns(new DirectoryPath(root).join('package'));
    });

    it('reports a missing template rather than throwing, and writes nothing', async () => {
      const written = await service.write(generated, pagesFor());

      expect(written._unsafeUnwrapErr()).to.equal(
        "The portal page template 'sdks.mdx' is missing from this installation. Reinstall the CLI and try again."
      );
      expect(fs.existsSync(generated.toString())).to.be.false;
    });

    it('reports a placeholder the pages give no value for, naming the template', async () => {
      fs.writeFileSync(path.join(templates(), 'sdks.mdx'), '# SDKs');
      fs.writeFileSync(path.join(templates(), 'sdk.mdx'), '# {{name}} {{license}}');

      const written = await service.write(generated, pagesFor());

      expect(written._unsafeUnwrapErr()).to.equal(
        "A portal page template could not be filled. sdk.mdx: '{{license}}' names a value the page is not given."
      );
    });
  });
});
