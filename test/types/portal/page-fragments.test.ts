import { expect } from 'chai';
import { pageFragments } from '../../../src/types/portal/page-fragments';

describe('pageFragments', () => {
  /** Each fragment as its path under the includes directory, with its contents. */
  const written = (sdkDocs: Record<string, string>) =>
    pageFragments(new Map(Object.entries(sdkDocs))).map((fragment) => [
      `${fragment.folder}/${fragment.fileName}`,
      fragment.contents
    ]);

  it("writes each language's SDK docs", () => {
    expect(written({ typescript: '## Installation\n\nnpm install calc', python: '## Installation' })).to.deep.equal([
      ['sdk-docs/typescript.md', '## Installation\n\nnpm install calc\n'],
      ['sdk-docs/python.md', '## Installation\n']
    ]);
  });

  it('writes the SDK docs as delivered, but for a single trailing newline', () => {
    const [[, docs]] = written({ csharp: 'Text with {braces} and <tags>.\n\n\n' });

    expect(docs).to.equal('Text with {braces} and <tags>.\n');
  });

  it('writes nothing when no SDK docs were delivered', () => {
    expect(written({})).to.deep.equal([]);
  });
});
