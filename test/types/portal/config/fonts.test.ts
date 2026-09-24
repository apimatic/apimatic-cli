import { expect } from 'chai';
import { Fonts } from '../../../../src/types/portal/config/fonts';

describe('Fonts', () => {
  const fonts = (value: unknown) => Fonts.parse(value, 'portal.brand.fonts')._unsafeUnwrap();

  it('defaults to Geist, as the template does today', () => {
    expect(fonts(undefined).toJSON()).to.deep.equal({ body: 'geist', mono: 'geist-mono' });
    expect(String(fonts({}).googleFontsUrl())).to.equal(
      'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap'
    );
  });

  it('puts the web font ahead of the system stack', () => {
    expect(fonts({ body: 'ibm-plex-sans' }).bodyFamily()).to.match(/^'IBM Plex Sans', ui-sans-serif, /);
    expect(fonts({ mono: 'jetbrains-mono' }).monoFamily()).to.match(/^'JetBrains Mono', ui-monospace, /);
  });

  it('names only the system stack for system, and loads nothing for it', () => {
    const system = fonts({ body: 'system', mono: 'system' });

    expect(system.bodyFamily()).to.match(/^ui-sans-serif, /);
    expect(system.monoFamily()).to.match(/^ui-monospace, /);
    expect(system.googleFontsUrl()).to.be.null;
    expect(String(fonts({ body: 'system', mono: 'fira-code' }).googleFontsUrl())).to.equal(
      'https://fonts.googleapis.com/css2?family=Fira+Code:wght@300..700&display=swap'
    );
  });

  // IBM Plex Mono is static: a range fails the whole stylesheet request with a 400.
  it('names the weights of a static family as a list', () => {
    expect(String(fonts({ body: 'system', mono: 'ibm-plex-mono' }).googleFontsUrl())).to.contain(
      'family=IBM+Plex+Mono:wght@100;200;300;400;500;600;700'
    );
  });

  it('refuses a family off the shortlist, and a key it does not know', () => {
    expect(
      Fonts.parse({ body: 'Comic Sans', heading: 'inter' }, 'portal.brand.fonts')._unsafeUnwrapErr()
    ).to.deep.equal([
      "'portal.brand.fonts.heading' is not a 'portal' setting.",
      "'portal.brand.fonts.body' must be one of 'geist', 'inter', 'ibm-plex-sans', 'roboto', 'open-sans', 'source-sans-3', 'manrope', 'dm-sans', 'system'."
    ]);
  });
});
