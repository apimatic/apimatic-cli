import { expect } from 'chai';
import { languageId } from '../../portal-template/src/lib/languages';
import { Language } from '../../src/types/sdk/generate';

describe('languageId', () => {
  // A download sends the language's key in `languages`, a copy this: one GA4 dimension holds both.
  it('is the key of every language the CLI generates an SDK in', () => {
    for (const language of Object.values(Language)) {
      expect(languageId(language)).to.equal(language);
    }
  });

  it('names a language by its ID, whichever alias the block was written with', () => {
    expect(['ts', 'cs', 'c#', 'py', 'bash', 'sh', 'yml'].map(languageId)).to.deep.equal([
      'typescript',
      'csharp',
      'csharp',
      'python',
      'shellscript',
      'shellscript',
      'yaml'
    ]);
  });

  it('keeps a language the bundle does not know as it was written', () => {
    expect(languageId('plaintext')).to.equal('plaintext');
    expect(languageId('rust')).to.equal('rust');
  });
});
