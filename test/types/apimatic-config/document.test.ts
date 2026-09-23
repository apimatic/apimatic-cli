import { expect } from 'chai';
import {
  ApimaticConfigDocument,
  ConfigFinding,
  findingClause,
  findingSentences
} from '../../../src/types/apimatic-config/document';

describe('ApimaticConfigDocument', () => {
  const parsed = (text: string): ApimaticConfigDocument => ApimaticConfigDocument.parse(text)._unsafeUnwrap();
  const parsedObject = (root: object): ApimaticConfigDocument => parsed(JSON.stringify(root));
  const refused = (text: string): ConfigFinding[] => ApimaticConfigDocument.parse(text)._unsafeUnwrapErr();

  const PLUGIN = { pluginId: 'acme-payments', pluginName: 'Acme Payments', pluginVersion: '0.1.0' };

  describe('parse', () => {
    it('refuses an empty file by saying so rather than reporting a syntax error', () => {
      expect(refused('')).to.deep.equal([{ block: 'root', field: null, problem: 'is empty' }]);
      expect(refused('  \n')).to.deep.equal([{ block: 'root', field: null, problem: 'is empty' }]);
    });

    it('refuses text that is not JSON', () => {
      expect(refused('nonsense')).to.deep.equal([{ block: 'root', field: null, problem: 'is not valid JSON' }]);
    });

    it('refuses JSON that is not an object', () => {
      expect(refused('[]')).to.deep.equal([{ block: 'root', field: null, problem: 'is not a JSON object' }]);
      expect(refused('"portal"')).to.deep.equal([{ block: 'root', field: null, problem: 'is not a JSON object' }]);
      expect(refused('null')).to.deep.equal([{ block: 'root', field: null, problem: 'is not a JSON object' }]);
    });

    it('reads a file that starts with a byte-order mark', () => {
      const document = parsed('﻿{ "portal": { "title": "Calc" } }');

      expect(document.portal()).to.deep.equal({ title: 'Calc' });
      expect(document.findingsFor('root', 'portal', 'plugin', 'languages')).to.deep.equal([]);
    });

    it('accepts an empty object with nothing to report', () => {
      expect(parsed('{}').findingsFor('root', 'portal', 'plugin', 'languages')).to.deep.equal([]);
    });
  });

  describe('schemaVersion', () => {
    it('accepts the version this CLI reads, and none at all', () => {
      expect(parsedObject({ schemaVersion: 1 }).findingsFor('root')).to.deep.equal([]);
      expect(parsedObject({}).findingsFor('root')).to.deep.equal([]);
    });

    it('reports any other version at the root, naming the one this CLI reads', () => {
      const findings = parsedObject({ schemaVersion: 2, portal: { title: 'Calc' } }).findingsFor('root');

      expect(findings).to.deep.equal([
        {
          block: 'root',
          field: 'schemaVersion',
          problem: 'is 2, which this version of the CLI does not read; it reads 1'
        }
      ]);
    });

    it('does not read a string as the version it spells', () => {
      const [finding] = parsedObject({ schemaVersion: '1' }).findingsFor('root');

      expect(finding.problem).to.contain('is "1"');
    });
  });

  describe('blocks', () => {
    it('hands the portal block over as written, whatever it is', () => {
      expect(parsedObject({ portal: { title: 'Calc' } }).portal()).to.deep.equal({ title: 'Calc' });
      expect(parsedObject({ portal: 'Calc' }).portal()).to.equal('Calc');
      expect(parsedObject({}).portal()).to.be.undefined;
    });

    it('never reports a portal finding itself; the portal parser owns that block', () => {
      expect(parsedObject({ portal: 'Calc' }).findingsFor('portal')).to.deep.equal([]);
    });

    it('reads the plugin and languages blocks when they are objects', () => {
      const document = parsedObject({ plugin: PLUGIN, languages: { csharp: { codegenVersion: 'v3' } } });

      expect(document.plugin()).to.deep.equal(PLUGIN);
      expect(document.languages()).to.deep.equal({ csharp: { codegenVersion: 'v3' } });
    });

    it('reports a plugin block that is not an object and withholds it', () => {
      const document = parsedObject({ plugin: 'acme' });

      expect(document.plugin()).to.be.undefined;
      expect(document.findingsFor('plugin')).to.deep.equal([
        { block: 'plugin', field: 'plugin', problem: 'is not a JSON object' }
      ]);
    });

    it('reports a languages block that is not an object and withholds it', () => {
      const document = parsedObject({ languages: 'csharp' });

      expect(document.languages()).to.be.undefined;
      expect(document.findingsFor('languages')).to.deep.equal([
        { block: 'languages', field: 'languages', problem: 'is not a JSON object' }
      ]);
    });

    it('names the language whose entry is not an object, and still hands the block over', () => {
      const document = parsedObject({ languages: { csharp: 'v3', java: {} } });

      expect(document.languages()).to.deep.equal({ csharp: 'v3', java: {} });
      expect(document.findingsFor('languages')).to.deep.equal([
        { block: 'languages', field: 'languages.csharp', problem: 'is not a JSON object' }
      ]);
    });

    it('treats a null block like any other non-object', () => {
      expect(parsedObject({ plugin: null }).findingsFor('plugin')).to.have.length(1);
      expect(parsedObject({ languages: null }).findingsFor('languages')).to.have.length(1);
    });
  });

  describe('plugin identity', () => {
    const pluginFindings = (plugin: object) => parsedObject({ plugin }).findingsFor('plugin');

    ['Acme Payments', 'acme_payments', 'Acme-Payments', 'acme--payments', '-acme', 'acme-', '   '].forEach(
      (pluginId) => {
        it(`reports a pluginId of '${pluginId}'`, () => {
          const findings = pluginFindings({ ...PLUGIN, pluginId });

          expect(findings).to.have.length(1);
          expect(findings[0]).to.include({ block: 'plugin', field: 'plugin.pluginId' });
          expect(findings[0].problem).to.contain('acme-payments');
        });
      }
    );

    ['1.2', '1.2.3.4', 'v1.2.3', '1.2.x', 'latest', '  0.1.0  ', '  '].forEach((pluginVersion) => {
      it(`reports a pluginVersion of '${pluginVersion}'`, () => {
        const findings = pluginFindings({ ...PLUGIN, pluginVersion });

        expect(findings).to.have.length(1);
        expect(findings[0]).to.include({ block: 'plugin', field: 'plugin.pluginVersion' });
        expect(findings[0].problem).to.contain('major.minor.patch');
      });
    });

    it('refuses an id padded with whitespace', () => {
      expect(pluginFindings({ ...PLUGIN, pluginId: '  acme-payments  ' })).to.have.length(1);
    });

    // A hand-edited field is worth reporting even when the other one has yet to be written.
    it('reports a malformed field whose partner is not set yet', () => {
      expect(pluginFindings({ pluginId: 'Acme Payments' })[0]).to.include({ field: 'plugin.pluginId' });
      expect(pluginFindings({ pluginVersion: '1.2' })[0]).to.include({ field: 'plugin.pluginVersion' });
    });

    it('reports both fields when both are wrong', () => {
      expect(pluginFindings({ pluginId: 'Acme', pluginVersion: '1' }).map((finding) => finding.field)).to.deep.equal([
        'plugin.pluginId',
        'plugin.pluginVersion'
      ]);
    });

    // Not a string is not the plugin's rule to judge; the readers treat it as unset.
    it('leaves a field that is not a string to the readers', () => {
      expect(pluginFindings({ pluginId: 7, pluginVersion: 1 })).to.deep.equal([]);
    });

    it('accepts a well-formed identity', () => {
      expect(pluginFindings(PLUGIN)).to.deep.equal([]);
    });
  });

  describe('findingsFor', () => {
    const document = parsedObject({ schemaVersion: 2, plugin: 'acme', languages: { csharp: 'v3' } });

    it('hands each caller the blocks it asks for, in the order found', () => {
      expect(document.findingsFor('root').map((finding) => finding.field)).to.deep.equal(['schemaVersion']);
      expect(document.findingsFor('plugin', 'languages').map((finding) => finding.field)).to.deep.equal([
        'plugin',
        'languages.csharp'
      ]);
      expect(document.findingsFor('root', 'plugin', 'languages')).to.have.length(3);
    });

    it('hands nothing to a caller that asks for nothing wrong', () => {
      expect(document.findingsFor('portal')).to.deep.equal([]);
    });
  });

  describe('with', () => {
    it('replaces a block where it stands, leaving every other key in place', () => {
      const document = parsedObject({ $schema: 'x', portal: { title: 'Calc' }, custom: true, languages: {} });

      const next = document.with('portal', { title: 'Renamed' });

      expect(JSON.parse(next.serialize('  ', false))).to.deep.equal({
        $schema: 'x',
        portal: { title: 'Renamed' },
        custom: true,
        languages: {}
      });
      expect(Object.keys(JSON.parse(next.serialize('  ', false)))).to.deep.equal([
        '$schema',
        'portal',
        'custom',
        'languages'
      ]);
    });

    it('appends a block the file did not hold after the last key', () => {
      const next = parsedObject({ schemaVersion: 1, portal: { title: 'Calc' } }).with('languages', { csharp: {} });

      expect(Object.keys(JSON.parse(next.serialize('  ', false)))).to.deep.equal([
        'schemaVersion',
        'portal',
        'languages'
      ]);
    });

    it('leaves the document it was called on untouched', () => {
      const document = parsedObject({ portal: { title: 'Calc' } });

      document.with('portal', { title: 'Renamed' });

      expect(document.portal()).to.deep.equal({ title: 'Calc' });
    });

    it('reads the findings off the document as it now stands', () => {
      const document = parsedObject({ languages: 'csharp' });

      expect(document.with('languages', {}).findingsFor('languages')).to.deep.equal([]);
    });
  });

  describe('serialize', () => {
    const document = parsedObject({ schemaVersion: 1, portal: { title: 'Calc' } });

    it('writes the keys in the order held, indented as asked, with the ending asked for', () => {
      expect(document.serialize('  ', true)).to.equal(
        '{\n  "schemaVersion": 1,\n  "portal": {\n    "title": "Calc"\n  }\n}\n'
      );
    });

    it('takes four spaces, a tab, and no trailing newline', () => {
      expect(document.serialize('    ', false)).to.equal(
        '{\n    "schemaVersion": 1,\n    "portal": {\n        "title": "Calc"\n    }\n}'
      );
      expect(document.serialize('\t', false)).to.equal(
        '{\n\t"schemaVersion": 1,\n\t"portal": {\n\t\t"title": "Calc"\n\t}\n}'
      );
    });

    it('starts an empty document from the schema version alone', () => {
      expect(ApimaticConfigDocument.empty().serialize('  ', true)).to.equal('{\n  "schemaVersion": 1\n}\n');
    });
  });

  describe('wording', () => {
    const findings: ConfigFinding[] = [
      { block: 'root', field: null, problem: 'is empty' },
      { block: 'languages', field: 'languages.csharp', problem: 'is not a JSON object' }
    ];

    it('lists one sentence per finding, naming the file or the field', () => {
      expect(findingSentences(findings)).to.deep.equal([
        'apimatic.json is empty.',
        "'languages.csharp' is not a JSON object."
      ]);
    });

    it('folds the findings into one clause about the file', () => {
      expect(findingClause(findings)).to.equal(`it is empty; its 'languages.csharp' is not a JSON object`);
      expect(findingClause([findings[0]])).to.equal('it is empty');
    });
  });
});
