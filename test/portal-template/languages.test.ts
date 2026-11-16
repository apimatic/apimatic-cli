import { expect } from 'chai';
import { languageId } from '../../portal-template/src/lib/languages';
import { Language } from '../../src/types/sdk/generate';

describe('languageId', () => {
  // A download and a copy both send this, so one GA4 dimension holds one set of values.
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

  it('reads a name or an alias written in capitals as the same language', () => {
    expect(['TypeScript', 'TS', 'C#', 'JSON'].map(languageId)).to.deep.equal([
      'typescript',
      'typescript',
      'csharp',
      'json'
    ]);
  });

  it('sends a language the bundle does not know in lowercase, so one language is one value', () => {
    expect(languageId('plaintext')).to.equal('plaintext');
    expect(['rust', 'Rust', 'Kotlin'].map(languageId)).to.deep.equal(['rust', 'rust', 'kotlin']);
  });
});
