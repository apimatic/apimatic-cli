import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { parse as parseYaml } from 'yaml';
import { PortalQuickstartAction } from '../../../src/actions/portal/quickstart';
import { DirectoryPath } from '../../../src/types/file/directoryPath';
import { FilePath } from '../../../src/types/file/filePath';
import { FileName } from '../../../src/types/file/fileName';
import { SpecFormat } from '../../../src/types/portal/spec-format';

// `scaffold` and `describeApi` are private: what they write is the contract, and the front
// matter they produce is parsed by the build, so it is asserted here rather than through the
// interactive wizard.
type Internals = {
  scaffold(sourceDirectory: DirectoryPath, specPath: FilePath): Promise<void>;
  describeApi(specPath: FilePath): Promise<{ siteTitle(): string; siteDescription(): string | null }>;
  specFormat(specPath: FilePath): Promise<SpecFormat>;
};

describe('PortalQuickstartAction', () => {
  let root: string;

  const action = () =>
    new PortalQuickstartAction(new DirectoryPath(os.tmpdir()), {
      commandName: 'portal quickstart',
      shell: 'bash'
    }) as unknown as Internals;

  const writeSpec = (info: Record<string, unknown>, prefix = ''): FilePath => {
    const name = 'spec.json';
    fs.writeFileSync(path.join(root, name), prefix + JSON.stringify({ openapi: '3.0.0', info, paths: {} }));
    return new FilePath(new DirectoryPath(root), new FileName(name));
  };

  const frontMatterOf = (markdown: string): Record<string, unknown> => {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
    expect(match, `no front matter in:\n${markdown}`).to.not.be.null;
    return parseYaml((match as RegExpExecArray)[1]);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-quickstart-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('scaffolded front matter', () => {
    // A title reaches the generated page unescaped. The build parses that front matter with
    // no guard, so one that does not parse fails the whole build rather than one page.
    const titles = [
      'Swagger Petstore',
      'Swagger Petstore: Extended',
      'Swagger Petstore:',
      'Swagger Petstore:Extended',
      'Petstore #1',
      'Petstore - v2',
      'The "Best" API',
      'C:\\petstore',
      "Ann's API",
      '@petstore',
      'yes',
      '1.0',
      '[bracketed]',
      '{braced}',
      'a: b: c'
    ];

    titles.forEach((title) => {
      it(`parses, and keeps the title intact, for ${JSON.stringify(title)}`, async () => {
        const source = new DirectoryPath(path.join(root, 'proj')).join('src');

        await action().scaffold(source, writeSpec({ title, version: '1' }));

        const markdown = fs.readFileSync(path.join(source.toString(), 'content', 'index.md'), 'utf8');
        expect(frontMatterOf(markdown).description).to.equal(`Getting started with ${title}`);
      });
    });
  });

  // The validation step accepts documents a portal cannot be built from. Refusing them only
  // once `portal serve` runs leaves a scaffolded directory the wizard then refuses to reuse,
  // because it requires an empty one.
  describe('refusing a document before anything is written', () => {
    // `format: null` is a document that names no version at all. The build skips such a file,
    // so the wizard has to refuse it rather than leave the preview to report an empty portal.
    const cases: [string, Record<string, unknown>, SpecFormat][] = [
      ['OpenAPI 3.0.4', { openapi: '3.0.4' }, { supported: true }],
      ['OpenAPI 3.1.0', { openapi: '3.1.0' }, { supported: true }],
      ['Swagger 2.0', { swagger: '2.0' }, { supported: false, format: 'Swagger 2.0' }],
      ['OpenAPI 2.0.0', { openapi: '2.0.0' }, { supported: false, format: 'OpenAPI 2.0.0' }],
      ['AsyncAPI 2.6.0', { asyncapi: '2.6.0' }, { supported: false, format: 'AsyncAPI 2.6.0' }],
      ['a Postman collection', { item: [], info: { schema: 'postman' } }, { supported: false, format: null }],
      ['a document with no version key', { paths: {} }, { supported: false, format: null }]
    ];

    cases.forEach(([label, document, expected]) => {
      it(`${expected.supported ? 'accepts' : 'refuses'} ${label}`, async () => {
        const name = 'spec.json';
        fs.writeFileSync(path.join(root, name), JSON.stringify({ ...document, info: {}, paths: {} }));
        const specPath = new FilePath(new DirectoryPath(root), new FileName(name));

        expect(await action().specFormat(specPath)).to.deep.equal(expected);
      });
    });
  });

  describe('describeApi', () => {
    it('reduces a title spanning several lines to one', async () => {
      const config = await action().describeApi(writeSpec({ title: 'Swagger\nPetstore', version: '1' }));

      expect(config.siteTitle()).to.equal('Swagger Petstore');
    });

    it('caps a long description rather than stopping at its first line break', async () => {
      const description = `${'First line of the summary. '}${'word '.repeat(200)}`;

      const config = await action().describeApi(
        writeSpec({ title: 'API', version: '1', description: description.replace('summary. ', 'summary.\n') })
      );

      expect(config.siteDescription()).to.have.length.greaterThan(200);
      expect(config.siteDescription()).to.have.length.at.most(300);
      expect(config.siteDescription()).to.not.include('\n');
    });

    it('falls back to a placeholder when the document names no title', async () => {
      const config = await action().describeApi(writeSpec({ version: '1' }));

      expect(config.siteTitle()).to.equal('My API');
      expect(config.siteDescription()).to.be.null;
    });

    it('ignores a title that is only whitespace', async () => {
      const config = await action().describeApi(writeSpec({ title: '  \n  ', version: '1' }));

      expect(config.siteTitle()).to.equal('My API');
    });

    // Windows editors and PowerShell redirection both write one, and the format check strips
    // it, so this reader has to as well or the document is accepted and named "My API".
    it('reads a document written with a byte-order mark', async () => {
      const config = await action().describeApi(
        writeSpec({ title: 'Swagger Petstore', version: '1', description: 'Pets.' }, '﻿')
      );

      expect(config.siteTitle()).to.equal('Swagger Petstore');
      expect(config.siteDescription()).to.equal('Pets.');
    });

    it('reads a YAML document written with a byte-order mark', async () => {
      const name = 'spec.yaml';
      fs.writeFileSync(path.join(root, name), '﻿openapi: 3.0.0\ninfo:\n  title: Swagger Petstore\n  version: "1"\n');

      const config = await action().describeApi(new FilePath(new DirectoryPath(root), new FileName(name)));

      expect(config.siteTitle()).to.equal('Swagger Petstore');
    });
  });
});
