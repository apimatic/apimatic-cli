import { expect } from 'chai';
import { SpecDescription } from '../../../src/types/portal/spec-description';

describe('SpecDescription', () => {
  const described = (text: string) => SpecDescription.create(text) as SpecDescription;

  it('is null for a description that is missing, not a string, or blank', () => {
    expect(SpecDescription.create(undefined)).to.be.null;
    expect(SpecDescription.create(7)).to.be.null;
    expect(SpecDescription.create(' \n\t ')).to.be.null;
  });

  it('leads with the first paragraph and keeps the rest for below the cards', () => {
    const description = described('Adds numbers,\nquickly.\n\n# Authentication\n\nSend a key.\n');

    expect(description.lead()).to.equal('Adds numbers,\nquickly.');
    expect(description.rest()).to.equal('# Authentication\n\nSend a key.');
  });

  it('has nothing left over when it is a single paragraph', () => {
    const description = described('  Adds numbers.  ');

    expect(description.lead()).to.equal('Adds numbers.');
    expect(description.rest()).to.equal('');
  });

  it('splits on a line holding only spaces, and on Windows line endings', () => {
    expect(described('Lead.\n   \nRest.').rest()).to.equal('Rest.');
    expect(described('Lead.\r\n\r\nRest.\r\nMore.').rest()).to.equal('Rest.\nMore.');
  });

  // The introduction above the cards has to read as one, so anything but prose is kept below them.
  it('has no lead when it opens with anything but a plain paragraph', () => {
    const openings = [
      '# Calculator',
      '   # Calculator, indented as far as a heading may be',
      '> A quote.',
      '- A list',
      '* A list',
      '1. A list',
      '| A | table |',
      '<p>HTML</p>',
      '```\ncode\n```',
      '~~~\ncode\n~~~',
      '    indented code',
      'Calculator\n==========',
      'Calculator\n---'
    ];
    for (const opening of openings) {
      const description = described(`${opening}\n\nMore.`);

      expect(description.lead(), opening).to.be.null;
      expect(description.rest(), opening).to.equal(`${opening}\n\nMore.`);
    }
  });

  it('leads with a paragraph that merely contains Markdown', () => {
    expect(
      described('The **Calculator** API, see [the docs](https://docs.test) for {id} and <b>more</b>.').lead()
    ).to.equal('The **Calculator** API, see [the docs](https://docs.test) for {id} and <b>more</b>.');
  });
});
