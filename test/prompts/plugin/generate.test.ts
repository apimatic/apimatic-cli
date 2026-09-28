import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { PluginGeneratePrompts } from '../../../src/prompts/plugin/generate.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { PluginConfig } from '../../../src/types/plugin-config-context.js';

describe('PluginGeneratePrompts', () => {
  const identity = { pluginId: 'acme-payments', pluginName: 'Acme Payments' };
  const sourceDirectory = new DirectoryPath('src');

  afterEach(() => {
    sinon.restore();
  });

  // Each message names only what `apimatic.json` still lacks, so the reader fixes the right thing.
  describe('setupNeedsTerminal', () => {
    const printed = (config: PluginConfig) => {
      const error = sinon.stub(log, 'error');
      new PluginGeneratePrompts().setupNeedsTerminal(sourceDirectory, config);
      return stripVTControlCharacters(String(error.firstCall.args[0]));
    };

    it('asks for the name and the languages of a project that records neither', () => {
      expect(printed(PluginConfig.empty)).to.contain(
        "A project's first plugin asks for its name and languages, and there is no terminal to ask in."
      );
    });

    it('asks for the name alone when the languages are recorded', () => {
      const message = printed(PluginConfig.create({ languages: { csharp: {} } }));

      expect(message).to.contain("A project's first plugin asks for its name, and there is no terminal to ask in.");
      expect(message).to.contain('later runs read it from');
    });

    it('shows how to record a language when only the languages are missing', () => {
      const message = printed(PluginConfig.create({ ...identity, languages: {} }));

      expect(message).to.contain('names no language the plugin can carry, and there is no terminal to ask which.');
      expect(message).to.contain('"languages": { "typescript": {} }');
    });
  });
});
