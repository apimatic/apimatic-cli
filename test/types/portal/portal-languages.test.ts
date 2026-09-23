import { expect } from 'chai';
import { ApimaticConfigDocument } from '../../../src/types/apimatic-config/document';
import { PortalLanguages } from '../../../src/types/portal/portal-languages';
import { Language } from '../../../src/types/sdk/generate';

describe('PortalLanguages', () => {
  /** The block and its findings as the portal path reads them from a whole file. */
  const read = (file: object) => {
    const document = ApimaticConfigDocument.parse(JSON.stringify(file))._unsafeUnwrap();
    return PortalLanguages.fromBlock(document.languages(), document.findingsFor('languages'));
  };

  const REQUIRED =
    /^'languages' must name at least one SDK language, for example "languages": \{ "typescript": \{\} \}\./;

  it('is required, and says how to write it', () => {
    const errors = read({ portal: {} })._unsafeUnwrapErr();

    expect(errors).to.have.lengthOf(1);
    expect(errors[0]).to.match(REQUIRED);
  });

  it('needs at least one entry', () => {
    expect(read({ languages: {} })._unsafeUnwrapErr()[0]).to.match(REQUIRED);
  });

  it('counts a language that is wanted but not yet published', () => {
    const languages = read({ languages: { typescript: {} } })._unsafeUnwrap();

    expect(languages.all()).to.deep.equal([Language.TYPESCRIPT]);
    expect(languages.isPublished(Language.TYPESCRIPT)).to.be.false;
  });

  it('tells a published language apart by its publishing record', () => {
    const languages = read({
      languages: {
        python: { publishing: { package: { name: 'calc', version: '1.0.0' }, codegenVersion: 'v4' } },
        java: { publishing: { codegenVersion: 'v3' } }
      }
    })._unsafeUnwrap();

    expect(languages.all()).to.deep.equal([Language.PYTHON, Language.JAVA]);
    expect(languages.isPublished(Language.PYTHON)).to.be.true;
    expect(languages.isPublished(Language.JAVA)).to.be.false;
  });

  it('refuses a key that is no SDK language', () => {
    expect(read({ languages: { typescipt: {} } })._unsafeUnwrapErr()).to.deep.equal([
      "'languages.typescipt' is not an SDK language; name one of 'csharp', 'java', 'php', 'python', 'ruby', 'typescript', 'go'."
    ]);
  });

  // The document's own shape checks already say what is wrong, so nothing is added to them.
  it('reports a block or an entry of the wrong shape as the document found it', () => {
    expect(read({ languages: 'typescript' })._unsafeUnwrapErr()).to.deep.equal(["'languages' is not a JSON object."]);
    expect(read({ languages: { go: 'yes', ruby: { publishing: 1 } } })._unsafeUnwrapErr()).to.deep.equal([
      "'languages.go' is not a JSON object.",
      "'languages.ruby.publishing' is not a JSON object."
    ]);
  });
});
