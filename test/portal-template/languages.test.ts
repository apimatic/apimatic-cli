import { expect } from 'chai';
import { bundledLanguage, languageId, reportedAliases } from '../../portal-template/src/lib/languages';
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

  it('names a language outside the bundle by its ID too, whichever short name the block was written with', () => {
    expect(['kt', 'KT', 'rs', 'c++', 'ps1', 'dockerfile'].map(languageId)).to.deep.equal([
      'kotlin',
      'kotlin',
      'rust',
      'cpp',
      'powershell',
      'docker'
    ]);
  });

  // A page's own block in no language reports `plaintext`; a description's reports `text`.
  it('reports a block in no language as plaintext, by any of the names Shiki has for it', () => {
    expect(['text', 'txt', 'plain', 'plaintext'].map(languageId)).to.deep.equal(Array(4).fill('plaintext'));
  });

  it('gives each short name outside the bundle the ID Shiki gives it, and shadows no bundled name', async () => {
    const { bundledLanguagesInfo } = (await import('shiki/bundle/full')) as {
      bundledLanguagesInfo: { id: string; aliases?: string[] }[];
    };

    for (const [alias, id] of Object.entries(reportedAliases)) {
      expect(bundledLanguage(alias), alias).to.be.null;
      if (id === 'plaintext') continue;
      expect(bundledLanguagesInfo.find((entry) => entry.id === id)?.aliases, `${alias} for ${id}`).to.include(alias);
    }
  });
});
