import { expect } from 'chai';
import SdkGenerate from '../../../src/commands/sdk/generate.js';

describe('sdk generate --help', () => {
  it('names the languages available now and the ones coming soon', () => {
    expect(SdkGenerate.description).to.contain(
      'C#, TypeScript and Python are available; Java, Ruby, Go and PHP are coming soon.'
    );
  });

  // The same words as the docs' CLI Reference, so the README and the portal never drift.
  it('says how to keep your changes across regenerations, as the docs do', () => {
    expect(SdkGenerate.description).to.contain(
      'To keep your changes to the generated SDK when you regenerate it, install Git 2.38 or later and make the ' +
        'SDK directory its own Git repository (--git-init does this for you).'
    );
    expect(SdkGenerate.flags['git-init'].description).to.equal(
      'Track the SDK directory with its own git repository so your customizations survive regeneration.'
    );
  });
});
