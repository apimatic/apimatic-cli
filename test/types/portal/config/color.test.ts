import { expect } from 'chai';
import { Color } from '../../../../src/types/portal/config/color';

describe('Color', () => {
  const color = (value: string) => {
    const parsed = Color.create(value);
    expect(parsed, value).to.not.be.undefined;
    return parsed as Color;
  };

  describe('create', () => {
    it('reads both hex forms, in either case', () => {
      for (const value of ['#fff', '#1d4ed8', '#1D4ED8', '#AbC']) {
        color(value);
      }
    });

    it('refuses every other form', () => {
      for (const value of [
        'blue',
        '1d4ed8',
        '#12345',
        '#fffa',
        '#1d4ed8cc',
        '#ggg',
        'rgb(29, 78, 216)',
        'hsl(221, 83%, 53%)',
        'oklch(0.5 0.2 240)',
        ''
      ]) {
        expect(Color.create(value), value).to.be.undefined;
      }
    });

    it('keeps the colour as written, for the stylesheet', () => {
      expect(color('  #1d4ed8 ').toString()).to.equal('#1d4ed8');
    });
  });

  describe('luminance', () => {
    it('matches known values', () => {
      expect(color('#ffffff').luminance()).to.be.closeTo(1, 1e-9);
      expect(color('#000').luminance()).to.be.closeTo(0, 1e-9);
      expect(color('#808080').luminance()).to.be.closeTo(0.2159, 1e-4);
      expect(color('#f00').luminance()).to.be.closeTo(0.2126, 1e-4);
      expect(color('#00ff00').luminance()).to.be.closeTo(0.7152, 1e-4);
    });

    it('reads the short form as each digit doubled', () => {
      expect(color('#1ad').luminance()).to.equal(color('#11aadd').luminance());
    });
  });

  it('measures the WCAG contrast ratio', () => {
    expect(color('#fff').contrastWith(color('#000'))).to.be.closeTo(21, 1e-9);
    expect(color('#000').contrastWith(color('#fff'))).to.be.closeTo(21, 1e-9);
  });

  describe('foreground', () => {
    it('lays the near-white over a dark primary and the near-black over a light one', () => {
      expect(color('#1d4ed8').foreground().toString()).to.equal('hsl(0, 0%, 98%)');
      expect(color('#93c5fd').foreground().toString()).to.equal('hsl(0, 0%, 9%)');
    });

    // The two greys read equally well at a luminance of about 0.193, #797979's neighbourhood.
    it('switches on either side of the crossover', () => {
      expect(color('#787878').foreground().toString()).to.equal('hsl(0, 0%, 98%)');
      expect(color('#7c7c7c').foreground().toString()).to.equal('hsl(0, 0%, 9%)');
    });
  });
});
