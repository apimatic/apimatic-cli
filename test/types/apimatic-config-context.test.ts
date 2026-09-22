import fs from 'fs';
import path from 'path';
import mockFs from 'mock-fs';
import sinon from 'sinon';
import { expect } from 'chai';
import { ApimaticConfigContext, ApimaticConfigState } from '../../src/types/apimatic-config-context';
import { ApimaticConfigDocument } from '../../src/types/apimatic-config/document';
import { FileService } from '../../src/infrastructure/file-service';
import { DirectoryPath } from '../../src/types/file/directoryPath';

describe('ApimaticConfigContext', () => {
  const inputDirectory = new DirectoryPath('project');
  const context = new ApimaticConfigContext(inputDirectory);
  // Resolved, as DirectoryPath resolves what it is given.
  const configPath = path.resolve('project', 'apimatic.json');

  const CSHARP_ENTRY = { source: { repositoryUrl: 'https://github.com/acme/acme-csharp' }, codegenVersion: 'v3' };

  const withFile = (text: string) => mockFs({ project: { 'apimatic.json': text } });
  const withConfig = (config: object) => withFile(JSON.stringify(config, null, 2) + '\n');
  const written = () => fs.readFileSync(configPath, 'utf-8');
  const writtenConfig = () => JSON.parse(written());

  const recordCsharp = (document: ApimaticConfigDocument) =>
    document.with('languages', { ...document.languages(), csharp: CSHARP_ENTRY });

  const parsedState = (state: ApimaticConfigState) => {
    if (state.state !== 'parsed') {
      expect.fail(`expected a parsed document, got ${state.state}`);
    }
    return state;
  };

  afterEach(() => {
    sinon.restore();
    mockFs.restore();
  });

  describe('exists', () => {
    it('is false without the file and true with it', async () => {
      mockFs({ project: {} });
      expect(await context.exists()).to.be.false;

      withConfig({});
      expect(await context.exists()).to.be.true;
    });

    it('looks at the root of the input directory, not inside src', async () => {
      mockFs({ project: { src: { 'apimatic.json': '{}' } } });

      expect(await context.exists()).to.be.false;
    });
  });

  describe('read', () => {
    it('is missing when there is no file', async () => {
      mockFs({ project: {} });

      expect(await context.read()).to.deep.equal({ state: 'missing' });
    });

    it('is unparseable, with the findings and the path, when the file holds no JSON object', async () => {
      withFile('{ not json');

      const state = await context.read();

      expect(state.state).to.equal('unparseable');
      if (state.state === 'unparseable') {
        expect(state.findings).to.deep.equal([{ block: 'root', field: null, problem: 'is not valid JSON' }]);
        expect(state.path.toString()).to.equal(configPath);
      }
    });

    it('is parsed, with the document and the path, for a JSON object', async () => {
      withConfig({ schemaVersion: 1, portal: { title: 'Calc' } });

      const state = parsedState(await context.read());

      expect(state.document.portal()).to.deep.equal({ title: 'Calc' });
      expect(state.path.toString()).to.equal(configPath);
    });

    it('is parsed even when a block is malformed; the findings say which', async () => {
      withConfig({ portal: { title: 'Calc' }, languages: 'csharp' });

      const state = parsedState(await context.read());

      expect(state.document.portal()).to.deep.equal({ title: 'Calc' });
      expect(state.document.findingsFor('languages').map((finding) => finding.field)).to.deep.equal(['languages']);
    });

    it('reads a file that starts with a byte-order mark', async () => {
      withFile('﻿{ "portal": { "title": "Calc" } }');

      expect(parsedState(await context.read()).document.portal()).to.deep.equal({ title: 'Calc' });
    });

    it('reports a file it cannot read as unparseable rather than throwing', async () => {
      withConfig({});
      sinon.stub(FileService.prototype, 'getContents').rejects(new Error('EACCES: permission denied'));

      const state = await context.read();

      expect(state.state).to.equal('unparseable');
      if (state.state === 'unparseable') {
        expect(state.findings[0].problem).to.contain('could not be read');
        expect(state.findings[0].problem).to.contain('EACCES');
      }
    });
  });

  describe('merge', () => {
    describe('creating the file', () => {
      it('starts from the schema version, two-space indentation and a trailing newline', async () => {
        mockFs({ project: {} });

        const result = await context.merge(['languages'], recordCsharp);

        expect(result.isOk()).to.be.true;
        expect(written()).to.equal(
          [
            '{',
            '  "schemaVersion": 1,',
            '  "languages": {',
            '    "csharp": {',
            '      "source": {',
            '        "repositoryUrl": "https://github.com/acme/acme-csharp"',
            '      },',
            '      "codegenVersion": "v3"',
            '    }',
            '  }',
            '}',
            ''
          ].join('\n')
        );
      });

      it('creates the input directory when it is not there yet', async () => {
        mockFs({});

        expect((await context.merge(['portal'], (document) => document.with('portal', { title: 'Calc' }))).isOk()).to.be
          .true;
        expect(writtenConfig()).to.deep.equal({ schemaVersion: 1, portal: { title: 'Calc' } });
      });

      it('hands back the document it wrote', async () => {
        mockFs({ project: {} });

        const document = (await context.merge(['languages'], recordCsharp))._unsafeUnwrap();

        expect(document.languages()).to.deep.equal({ csharp: CSHARP_ENTRY });
      });
    });

    describe('merging into a file', () => {
      it('writes the block into a file holding only portal, leaving portal untouched and first', async () => {
        withConfig({ $schema: 'https://example.com/schema.json', portal: { title: 'Calc', logo: 'static/logo.png' } });

        await context.merge(['languages'], recordCsharp);

        expect(writtenConfig()).to.deep.equal({
          $schema: 'https://example.com/schema.json',
          portal: { title: 'Calc', logo: 'static/logo.png' },
          languages: { csharp: CSHARP_ENTRY }
        });
        expect(Object.keys(writtenConfig())).to.deep.equal(['$schema', 'portal', 'languages']);
      });

      it('keeps root keys this CLI does not know, in their place', async () => {
        withConfig({ future: { enabled: true }, languages: {}, another: 1 });

        await context.merge(['languages'], recordCsharp);

        expect(Object.keys(writtenConfig())).to.deep.equal(['future', 'languages', 'another']);
        expect(writtenConfig().future).to.deep.equal({ enabled: true });
      });

      it('does not add a schema version to a file that has none', async () => {
        withConfig({ portal: { title: 'Calc' } });

        await context.merge(['languages'], recordCsharp);

        expect(writtenConfig()).to.not.have.property('schemaVersion');
      });

      it('keeps four-space indentation', async () => {
        withFile('{\n    "portal": {\n        "title": "Calc"\n    }\n}\n');

        await context.merge(['languages'], (document) => document.with('languages', {}));

        expect(written()).to.equal('{\n    "portal": {\n        "title": "Calc"\n    },\n    "languages": {}\n}\n');
      });

      it('keeps tab indentation', async () => {
        withFile('{\n\t"portal": {\n\t\t"title": "Calc"\n\t}\n}\n');

        await context.merge(['languages'], (document) => document.with('languages', {}));

        expect(written()).to.equal('{\n\t"portal": {\n\t\t"title": "Calc"\n\t},\n\t"languages": {}\n}\n');
      });

      it('keeps a missing trailing newline missing', async () => {
        withFile('{\n  "portal": {\n    "title": "Calc"\n  }\n}');

        await context.merge(['languages'], (document) => document.with('languages', {}));

        expect(written()).to.equal('{\n  "portal": {\n    "title": "Calc"\n  },\n  "languages": {}\n}');
      });

      it('falls back to two spaces for a file written on one line', async () => {
        withFile('{"portal":{"title":"Calc"}}');

        await context.merge(['languages'], (document) => document.with('languages', {}));

        expect(written()).to.equal('{\n  "portal": {\n    "title": "Calc"\n  },\n  "languages": {}\n}');
      });

      // Accepted in the plan: line endings are the one thing the writer does not keep.
      it('writes LF line endings over a CRLF file, keeping its indentation', async () => {
        withFile('{\r\n    "portal": {\r\n        "title": "Calc"\r\n    }\r\n}\r\n');

        await context.merge(['languages'], (document) => document.with('languages', {}));

        expect(written()).to.equal('{\n    "portal": {\n        "title": "Calc"\n    },\n    "languages": {}\n}\n');
      });
    });

    describe('refusing', () => {
      it('leaves a file it cannot parse alone', async () => {
        withFile('{ not json');

        expect((await context.merge(['languages'], recordCsharp))._unsafeUnwrapErr()).to.equal('unreadable');
        expect(written()).to.equal('{ not json');
      });

      it('leaves a file alone when a block it is about to write is malformed', async () => {
        const original = JSON.stringify({ languages: 'csharp' });
        withFile(original);

        expect((await context.merge(['languages'], recordCsharp))._unsafeUnwrapErr()).to.equal('unreadable');
        expect(written()).to.equal(original);
      });

      it('leaves a file alone when its schema version is not the one this CLI reads', async () => {
        const original = JSON.stringify({ schemaVersion: 2, languages: {} });
        withFile(original);

        expect((await context.merge(['languages'], recordCsharp))._unsafeUnwrapErr()).to.equal('unreadable');
        expect(written()).to.equal(original);
      });

      it('writes past a malformed block it was not asked to touch, preserving it as written', async () => {
        withConfig({ languages: 'csharp' });

        const result = await context.merge(['portal'], (document) => document.with('portal', { title: 'Calc' }));

        expect(result.isOk()).to.be.true;
        expect(writtenConfig()).to.deep.equal({ languages: 'csharp', portal: { title: 'Calc' } });
      });

      it('reports a write it could not make, leaving the file as it was', async () => {
        const original = JSON.stringify({ portal: { title: 'Calc' } });
        withFile(original);
        sinon.stub(FileService.prototype, 'replaceContents').rejects(new Error('EACCES: permission denied'));

        expect((await context.merge(['languages'], recordCsharp))._unsafeUnwrapErr()).to.equal('unwritable');
        expect(written()).to.equal(original);
      });
    });
  });
});
