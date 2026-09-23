import { expect } from 'chai';
import { Color } from '../../../../src/types/portal/config/color';

describe('Color', () => {
  const color = (value: string) => {
    const parsed = Color.create(value);
    expect(parsed, value).to.not.be.undefined;
    return parsed as Color;
  };

  describe('create', () => {
    it('reads every accepted form', () => {
      for (const value of [
        '#fff',
        '#1d4ed8',
        '#1D4ED8cc',
        'rgb(29, 78, 216)',
        'rgba(29, 78, 216, 0.5)',
        'rgb(29 78 216)',
        'rgb(29 78 216 / 50%)',
        'rgb(10%, 30%, 85%)',
        'hsl(221, 83%, 53%)',
        'hsla(221, 83%, 53%, 0.8)',
        'hsl(221deg 83% 53% / 0.8)',
        // The space form may mix numbers and percentages, and take bare numbers for hsl.
        'rgb(10% 30 85%)',
        'hsl(221 83 53)',
        'hsl(0.5turn 50% 50%)'
      ]) {
        color(value);
      }
    });

    it('reads a hue in any of the units CSS takes', () => {
      const luminance = (value: string) => color(value).luminance();

      expect(luminance('hsl(0.5turn 100% 50%)')).to.be.closeTo(luminance('hsl(180, 100%, 50%)'), 1e-9);
      expect(luminance('hsl(200grad 100% 50%)')).to.be.closeTo(luminance('hsl(180, 100%, 50%)'), 1e-9);
      expect(luminance(`hsl(${Math.PI}rad 100% 50%)`)).to.be.closeTo(luminance('hsl(180, 100%, 50%)'), 1e-9);
    });

    // A browser drops each of these as invalid, and every use of the primary with it.
    it('refuses what CSS refuses in the comma form', () => {
      for (const value of ['rgb(10%, 30, 85%)', 'rgba(29, 78%, 216, 0.5)', 'hsl(221, 83, 53%)']) {
        expect(Color.create(value), value).to.be.undefined;
      }
    });

    it('refuses what it cannot read the channels of', () => {
      for (const value of [
        'blue',
        'oklch(0.5 0.2 240)',
        '#12345',
        '#ggg',
        'rgb(256, 0, 0)',
        'rgb(1, 2)',
        'rgb(1, 2, 3, 4, 5)',
        'rgb(1 2 3 / 2)',
        'hsl(221, 83, 53)',
        'hsl(221, 101%, 53%)',
        'hsl(221 101 53)',
        'hsl(1turns 50% 50%)',
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
    });

    it('converts hsl the way CSS does', () => {
      expect(color('hsl(0, 100%, 50%)').luminance()).to.be.closeTo(0.2126, 1e-4);
      expect(color('hsl(120, 100%, 50%)').luminance()).to.be.closeTo(0.7152, 1e-4);
      expect(color('hsl(240deg 100% 50%)').luminance()).to.be.closeTo(0.0722, 1e-4);
      expect(color('hsl(-120, 100%, 50%)').luminance()).to.be.closeTo(0.0722, 1e-4);
    });

    it('reads rgb percentages as fractions of full intensity', () => {
      expect(color('rgb(100%, 100%, 100%)').luminance()).to.be.closeTo(1, 1e-9);
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
