import { stripVTControlCharacters } from 'node:util';
import { expect } from 'chai';
import sinon from 'sinon';
import { log } from '@clack/prompts';
import { ServiceError } from '../../../src/infrastructure/service-error.js';
import { PluginGeneratePrompts } from '../../../src/prompts/plugin/generate.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { PluginConfig } from '../../../src/types/plugin-config-context.js';
import { PluginGenerationProblem } from '../../../src/types/plugin/generation-problem.js';

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

  describe('pluginNotGenerated', () => {
    const printed = (problem: PluginGenerationProblem) => {
      const error = sinon.stub(log, 'error');
      new PluginGeneratePrompts().pluginNotGenerated(problem, sourceDirectory);
      return stripVTControlCharacters(String(error.firstCall.args[0]));
    };

    it('says what a bad response says, then why the plugin could not be unzipped', () => {
      expect(printed({ kind: 'unzipFailed', reason: 'EPERM: operation not permitted' })).to.equal(
        `${stripVTControlCharacters(ServiceError.InvalidResponse.errorMessage)}\nEPERM: operation not permitted`
      );
    });

    it('names the source directory it could not zip, and why', () => {
      expect(printed({ kind: 'zipFailed', reason: 'EACCES: permission denied' })).to.equal(
        `'${sourceDirectory}' could not be zipped for upload: EACCES: permission denied`
      );
    });

    it('passes the service message through as it was assembled', () => {
      const error = ServiceError.badRequest('One or more validation errors occurred.\n- a', { pluginConfig: ['a'] });

      expect(printed({ kind: 'generationFailed', error })).to.equal('One or more validation errors occurred.\n- a');
    });
  });
});
