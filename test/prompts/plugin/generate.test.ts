import { expect } from 'chai';
import sinon from 'sinon';
import { PluginGeneratePrompts } from '../../../src/prompts/plugin/generate.js';
import { DirectoryPath } from '../../../src/types/file/directoryPath.js';
import { stripAnsi } from '../../../src/utils/string-utils.js';

describe('PluginGeneratePrompts.tryPluginInClaudeCode', () => {
  const prompts = new PluginGeneratePrompts();
  const pluginDirectory = new DirectoryPath('./acme-payments/plugin');

  let written: string;
  let write: sinon.SinonStub;

  beforeEach(() => {
    written = '';
    // The note renders to stdout; capture it so the command line itself can be asserted.
    write = sinon.stub(process.stdout, 'write').callsFake((chunk: unknown) => {
      written += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    write.restore();
  });

  it('names the Claude Code command that loads the generated plugin', () => {
    prompts.tryPluginInClaudeCode(pluginDirectory);

    expect(stripAnsi(written)).to.contain(`claude --plugin-dir "${pluginDirectory}"`);
  });

  it('quotes the directory so a path containing spaces survives being pasted', () => {
    prompts.tryPluginInClaudeCode(new DirectoryPath('./acme payments/plugin'));

    expect(stripAnsi(written)).to.contain(`--plugin-dir "${new DirectoryPath('./acme payments/plugin')}"`);
  });
});
