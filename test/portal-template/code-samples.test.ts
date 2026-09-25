import { expect } from 'chai';
import { CodeSample } from '../../portal-template/src/lib/code-samples';

const operationWith = (...entries: unknown[]) => ({ 'x-apimatic-codeSamples': entries });

const typescript = {
  lang: 'typescript',
  label: 'TypeScript',
  sources: { minimal: 'ts minimal', full: 'ts full' }
};

const onlySample = (entry: object) => CodeSample.listIn(operationWith(entry))[0];

describe('CodeSample', () => {
  describe('listIn', () => {
    it('lists the samples of an operation in the order it gives them', () => {
      const samples = CodeSample.listIn(
        operationWith(typescript, { lang: 'python', label: 'Python', sources: { minimal: 'py' } })
      );

      expect(samples.map((sample) => [sample.lang, sample.label])).to.deep.equal([
        ['typescript', 'TypeScript'],
        ['python', 'Python']
      ]);
    });

    it('lists nothing for an operation without the extension', () => {
      expect(CodeSample.listIn({})).to.be.empty;
      expect(CodeSample.listIn(undefined)).to.be.empty;
      expect(CodeSample.listIn({ 'x-apimatic-codeSamples': { lang: 'go' } })).to.be.empty;
    });

    it('ignores x-codeSamples', () => {
      expect(CodeSample.listIn({ 'x-codeSamples': [{ lang: 'go', source: 'go code' }] })).to.be.empty;
    });

    it('skips malformed entries and keeps the rest', () => {
      const samples = CodeSample.listIn(
        operationWith(
          null,
          { label: 'No language', sources: { minimal: 'x' } },
          { lang: 'go', sources: { minimal: 'no label' } },
          { lang: 'ruby', label: 'Ruby' },
          { lang: 'php', label: 'PHP', sources: 'not a map' },
          { lang: 'csharp', label: 'C#', sources: { minimal: 42 } },
          typescript
        )
      );

      expect(samples.map((sample) => sample.lang)).to.deep.equal(['typescript']);
    });
  });

  describe('sourceFor', () => {
    it('returns the snippet for the selected example', () => {
      expect(onlySample(typescript).sourceFor('full', 2)).to.equal('ts full');
    });

    it('returns an empty snippet rather than treating it as missing', () => {
      expect(onlySample({ ...typescript, sources: { minimal: '', full: 'ts full' } }).sourceFor('minimal', 2)).to.equal(
        ''
      );
    });

    it('returns nothing for a selected example without a snippet', () => {
      expect(onlySample(typescript).sourceFor('bulk', 3)).to.be.undefined;
    });

    it('does not mistake an inherited property for a snippet', () => {
      expect(onlySample(typescript).sourceFor('constructor', 2)).to.be.undefined;
    });

    it('uses the only snippet for the only example, whatever its key', () => {
      const sample = onlySample({ lang: 'go', label: 'Go', sources: { Example: 'go code' } });

      expect(sample.sourceFor('_default', 1)).to.equal('go code');
    });

    it('returns nothing for the only example when several snippets leave the choice open', () => {
      expect(onlySample(typescript).sourceFor('_default', 1)).to.be.undefined;
    });

    it('returns nothing when no example is selected among several', () => {
      expect(onlySample(typescript).sourceFor(undefined, 2)).to.be.undefined;
    });
  });
});
