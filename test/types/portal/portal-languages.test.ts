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

    expect(languages.listed().map((sdk) => sdk.language)).to.deep.equal([Language.TYPESCRIPT]);
  });

  it('counts published and unpublished languages alike, in the order written', () => {
    const languages = read({
      languages: {
        python: { publishing: { package: { version: '1.0.0' }, packageConfiguration: { name: 'calc' } } },
        csharp: {},
        typescript: { publishing: { source: { repositoryUrl: 'https://github.com/acme/calc-ts' } } }
      }
    })._unsafeUnwrap();

    expect(languages.listed().map((sdk) => sdk.language)).to.deep.equal([
      Language.PYTHON,
      Language.CSHARP,
      Language.TYPESCRIPT
    ]);
  });

  it("keeps what each language's publishing record says", () => {
    const [python, csharp] = read({
      languages: {
        python: {
          publishing: {
            source: { repositoryUrl: 'https://github.com/acme/calc-py' },
            package: { version: '1.0.0' },
            packageConfiguration: { name: 'calc' }
          }
        },
        csharp: {}
      }
    })
      ._unsafeUnwrap()
      .listed();

    expect(`${python.sourceRepository()}`).to.equal('https://github.com/acme/calc-py');
    expect(python.release()?.version).to.equal('1.0.0');
    expect(csharp.sourceRepository()).to.be.null;
    expect(csharp.release()).to.be.null;
  });

  // Only three languages can be generated for today; the rest are named as coming, not as typos.
  it('refuses a language that is not available yet, naming the ones that are', () => {
    expect(read({ languages: { typescript: {}, java: {}, go: {} } })._unsafeUnwrapErr()).to.deep.equal([
      "'languages.java' is not available yet; the portal supports 'csharp', 'typescript' and 'python' today.",
      "'languages.go' is not available yet; the portal supports 'csharp', 'typescript' and 'python' today."
    ]);
  });

  it('refuses a key that is no SDK language, naming the ones it could be', () => {
    expect(read({ languages: { typescipt: {} } })._unsafeUnwrapErr()).to.deep.equal([
      "'languages.typescipt' is not an SDK language; name one of 'csharp', 'typescript' or 'python'."
    ]);
  });

  // The document's own shape checks already say what is wrong, so nothing is added to them.
  it('reports a block or an entry of the wrong shape as the document found it', () => {
    expect(read({ languages: 'typescript' })._unsafeUnwrapErr()).to.deep.equal(["'languages' is not a JSON object."]);
    expect(read({ languages: { csharp: 'yes', python: { publishing: 1 } } })._unsafeUnwrapErr()).to.deep.equal([
      "'languages.csharp' is not a JSON object.",
      "'languages.python.publishing' is not a JSON object."
    ]);
  });
});
