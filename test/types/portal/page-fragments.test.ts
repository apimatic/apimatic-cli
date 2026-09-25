import { expect } from 'chai';
import { pageFragments } from '../../../src/types/portal/page-fragments';
import { SpecDescription } from '../../../src/types/portal/spec-description';

describe('pageFragments', () => {
  /** Each fragment as its path under the includes directory, with its contents. */
  const written = (description: SpecDescription | null, sdkDocs: Record<string, string> = {}) =>
    pageFragments(description, new Map(Object.entries(sdkDocs))).map((fragment) => [
      fragment.folder === null ? `${fragment.fileName}` : `${fragment.folder}/${fragment.fileName}`,
      fragment.contents
    ]);

  it("splits the spec's description around the SDK cards, and writes each language's SDK docs", () => {
    const description = SpecDescription.create('Adds numbers.\n\n# Auth\n\nSend a key.');

    expect(
      written(description, { typescript: '## Installation\n\nnpm install calc', python: '## Installation' })
    ).to.deep.equal([
      ['sdks-intro.md', 'Adds numbers.\n'],
      ['sdks-about.md', '# Auth\n\nSend a key.\n'],
      ['sdk-docs/typescript.md', '## Installation\n\nnpm install calc\n'],
      ['sdk-docs/python.md', '## Installation\n']
    ]);
  });

  // Several specs, or none with a description: no one of them speaks for the portal.
  it('introduces the cards itself, in words that name no portal, when there is no description', () => {
    const [[, intro], [, about]] = written(null);

    expect(intro).to.equal(
      'Choose a language to download its SDK, or open its page to see how to install it and get started.\n'
    );
    expect(about).to.equal('');
  });

  it('keeps a description that does not open with a paragraph whole, below the cards', () => {
    const [[, intro], [, about]] = written(SpecDescription.create('# Calculator\n\nAdds numbers.'));

    expect(intro).to.match(/^Choose a language/);
    expect(about).to.equal('# Calculator\n\nAdds numbers.\n');
  });

  it('writes the SDK docs as delivered, but for a single trailing newline', () => {
    const [, , [, docs]] = written(null, { csharp: 'Text with {braces} and <tags>.\n\n\n' });

    expect(docs).to.equal('Text with {braces} and <tags>.\n');
  });
});
