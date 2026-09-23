import fs from 'fs';
import path from 'path';
import { expect } from 'chai';
import { COLOR_PRESETS } from '../../../src/types/portal/config/brand-config';
import { PortalConfig } from '../../../src/types/portal/portal-config';
import { PortalStylesheet } from '../../../src/types/portal/portal-stylesheet';

describe('PortalStylesheet', () => {
  const stylesheetFor = (block: object) =>
    PortalStylesheet.of(PortalConfig.fromBlock(block, { name: 'Calc', description: null })._unsafeUnwrap()).toString();

  /** The declarations of the one rule with this selector, in order, or undefined when there is none. */
  const ruleOf = (css: string, selector: string): string[] | undefined => {
    const start = css.indexOf(`\n${selector} {\n`);
    if (start === -1) return undefined;
    const body = css.slice(start + selector.length + 4, css.indexOf('\n}', start));
    return body.split('\n').map((line) => line.trim());
  };

  const importsOf = (css: string) => [...css.matchAll(/^@import '([^']+)';$/gm)].map((match) => match[1]);

  it('imports the neutral preset and sets the default fonts for an empty block', () => {
    const css = stylesheetFor({});

    expect(importsOf(css)).to.deep.equal(['fumadocs-ui/css/neutral.css']);
    expect(ruleOf(css, '@theme')).to.deep.equal([
      "--default-font-family: 'Geist', ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';",
      "--default-mono-font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;"
    ]);
    // Nothing overrides the preset's colours, so no rule is written for either mode.
    expect(ruleOf(css, ':root:not(.dark)')).to.be.undefined;
    expect(ruleOf(css, '.dark')).to.be.undefined;
  });

  // Every preset the block accepts has to be a file the package ships, or the build fails on
  // an import that cannot resolve.
  for (const preset of COLOR_PRESETS) {
    it(`imports the ${preset} preset, a file Fumadocs ships`, () => {
      const [specifier] = importsOf(stylesheetFor({ brand: { colors: { preset } } }));

      expect(specifier).to.equal(`fumadocs-ui/css/${preset}.css`);
      expect(fs.existsSync(path.join('node_modules', specifier))).to.be.true;
    });
  }

  it('imports the glass layout styles only for the glass layout', () => {
    expect(importsOf(stylesheetFor({ navigation: { layout: 'glass' } }))).to.deep.equal([
      'fumadocs-ui/css/neutral.css',
      'fumadocs-ui/css/generated/glass.css'
    ]);
    expect(fs.existsSync(path.join('node_modules', 'fumadocs-ui/css/generated/glass.css'))).to.be.true;
    for (const layout of ['docs', 'notebook', 'notebook-navbar']) {
      expect(importsOf(stylesheetFor({ navigation: { layout } })), layout).to.have.lengthOf(1);
    }
  });

  it('falls back to the system stacks alone for a system font', () => {
    const css = stylesheetFor({ brand: { fonts: { body: 'system', mono: 'system' } } });

    expect(ruleOf(css, '@theme')).to.deep.equal([
      "--default-font-family: ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';",
      "--default-mono-font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;"
    ]);
  });

  it('sets a primary written once in both modes, with a foreground picked for it', () => {
    const css = stylesheetFor({ brand: { colors: { primary: '#1d4ed8' } } });
    const trio = [
      '--color-fd-primary: #1d4ed8;',
      '--color-fd-primary-foreground: hsl(0, 0%, 98%);',
      '--color-fd-ring: #1d4ed8;'
    ];

    expect(ruleOf(css, ':root:not(.dark)')).to.deep.equal(trio);
    expect(ruleOf(css, '.dark')).to.deep.equal(trio);
  });

  it('sets each mode its own primary, each with its own foreground', () => {
    const css = stylesheetFor({ brand: { colors: { primary: { light: '#1d4ed8', dark: '#93c5fd' } } } });

    expect(ruleOf(css, ':root:not(.dark)')?.slice(0, 2)).to.deep.equal([
      '--color-fd-primary: #1d4ed8;',
      '--color-fd-primary-foreground: hsl(0, 0%, 98%);'
    ]);
    expect(ruleOf(css, '.dark')?.slice(0, 2)).to.deep.equal([
      '--color-fd-primary: #93c5fd;',
      '--color-fd-primary-foreground: hsl(0, 0%, 9%);'
    ]);
  });

  // A bare `:root` has the specificity of the presets' `.dark` block and comes after it, so a
  // colour meant for light mode would win in dark mode as well.
  it('scopes the light rule away from dark mode', () => {
    const css = stylesheetFor({ advanced: { tokens: { light: { '--color-fd-accent': '#eee' } } } });

    expect(css).to.contain(':root:not(.dark) {');
    expect(css).to.not.match(/^:root \{/m);
    expect(ruleOf(css, '.dark')).to.be.undefined;
  });

  it('writes the tokens after the primary, in the order written', () => {
    const css = stylesheetFor({
      brand: { colors: { primary: '#1d4ed8' } },
      advanced: { tokens: { dark: { '--color-fd-card': '#111', '--color-fd-accent': '#222' } } }
    });

    expect(ruleOf(css, '.dark')).to.deep.equal([
      '--color-fd-primary: #1d4ed8;',
      '--color-fd-primary-foreground: hsl(0, 0%, 98%);',
      '--color-fd-ring: #1d4ed8;',
      '--color-fd-card: #111;',
      '--color-fd-accent: #222;'
    ]);
  });

  // Declared once, so what the rule says is what applies, and the token still wins.
  it('lets a token replace the primary it names, in place', () => {
    const css = stylesheetFor({
      brand: { colors: { primary: '#1d4ed8' } },
      advanced: { tokens: { light: { '--color-fd-ring': 'hsl(220, 100%, 64%)' } } }
    });

    expect(ruleOf(css, ':root:not(.dark)')).to.deep.equal([
      '--color-fd-primary: #1d4ed8;',
      '--color-fd-primary-foreground: hsl(0, 0%, 98%);',
      '--color-fd-ring: hsl(220, 100%, 64%);'
    ]);
  });

  it('keeps every import ahead of the rules, as CSS requires', () => {
    const css = stylesheetFor({ navigation: { layout: 'glass' }, brand: { colors: { primary: '#1d4ed8' } } });
    const lastImport = css.lastIndexOf('@import');
    const firstRule = css.indexOf('{');

    expect(lastImport).to.be.below(firstRule);
    expect(css.endsWith('}\n')).to.be.true;
  });
});
