import fs from 'fs';
import path from 'path';
import { expect } from 'chai';
import { compile } from 'tailwindcss';
import { COLOR_PRESETS } from '../../../src/types/portal/config/brand-config';
import { PortalConfig } from '../../../src/types/portal/portal-config';
import { DARK_SELECTOR, LIGHT_SELECTOR, PortalStylesheet } from '../../../src/types/portal/portal-stylesheet';

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
    expect(ruleOf(css, LIGHT_SELECTOR)).to.be.undefined;
    expect(ruleOf(css, DARK_SELECTOR)).to.be.undefined;
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

    expect(ruleOf(css, LIGHT_SELECTOR)).to.deep.equal(trio);
    expect(ruleOf(css, DARK_SELECTOR)).to.deep.equal(trio);
  });

  it('sets each mode its own primary, each with its own foreground', () => {
    const css = stylesheetFor({ brand: { colors: { primary: { light: '#1d4ed8', dark: '#93c5fd' } } } });

    expect(ruleOf(css, LIGHT_SELECTOR)?.slice(0, 2)).to.deep.equal([
      '--color-fd-primary: #1d4ed8;',
      '--color-fd-primary-foreground: hsl(0, 0%, 98%);'
    ]);
    expect(ruleOf(css, DARK_SELECTOR)?.slice(0, 2)).to.deep.equal([
      '--color-fd-primary: #93c5fd;',
      '--color-fd-primary-foreground: hsl(0, 0%, 9%);'
    ]);
  });

  // A bare `:root` has the specificity of the presets' `.dark` block and comes after it, so a
  // colour meant for light mode would win in dark mode as well.
  it('scopes the light rule away from dark mode', () => {
    const css = stylesheetFor({ advanced: { tokens: { light: { '--color-fd-accent': '#eee' } } } });

    expect(LIGHT_SELECTOR.split(', ').every((selector) => selector.startsWith(':root:not(.dark)'))).to.be.true;
    expect(css).to.contain(`\n${LIGHT_SELECTOR} {\n`);
    expect(css).to.not.match(/^:root \{/m);
    expect(ruleOf(css, DARK_SELECTOR)).to.be.undefined;
  });

  // The layout renders the sidebar as `#nd-sidebar`, and neutral, catppuccin and vitepress
  // give it tokens of their own under that id, which outranks a rule for the mode alone.
  it('sets each mode on the sidebar too, since presets give it tokens of its own', () => {
    expect(LIGHT_SELECTOR.split(', ')).to.include(':root:not(.dark) #nd-sidebar');
    expect(DARK_SELECTOR.split(', ')).to.include('.dark #nd-sidebar');
  });

  describe('compiled as the build compiles it', () => {
    const styles = path.resolve('portal-template', 'src', 'styles');

    /**
     * The stylesheet through Tailwind, after Tailwind's own, as `app.css` has it, with every
     * import read from the installed packages. The Fumadocs presets `app.css` also imports set
     * no colour outside `@theme`, and one of them loads a plugin, so they are left out.
     */
    const compiled = async (theme: string): Promise<string> => {
      // As Node looks a package up, from the real directory of the file importing it: under
      // pnpm a package's own dependencies sit beside it, not at the top of `node_modules`.
      const resolvePackage = (id: string, base: string): string => {
        const target = id === 'tailwindcss' ? 'tailwindcss/index.css' : id;
        for (let directory = base; path.dirname(directory) !== directory; directory = path.dirname(directory)) {
          const candidate = path.join(directory, 'node_modules', target);
          if (fs.existsSync(candidate)) return fs.realpathSync(candidate);
        }
        throw new Error(`${id} is not installed below ${base}`);
      };
      const loadStylesheet = async (id: string, base: string) => {
        if (id === './theme.css' && base === styles) {
          return { path: path.join(styles, 'theme.css'), base: styles, content: theme };
        }
        const file = id.startsWith('.') ? path.resolve(base, id) : resolvePackage(id, base);
        return { path: file, base: path.dirname(file), content: fs.readFileSync(file, 'utf8') };
      };
      const app = "@import 'tailwindcss';\n@import './theme.css';\n";
      return (await compile(app, { base: styles, loadStylesheet })).build([]);
    };

    const tokens = {
      '--color-fd-accent': 'color-mix(in oklab, var(--color-fd-primary) 10%, transparent)',
      '--color-fd-muted': 'oklch(from var(--color-fd-primary) calc(l * 0.9) c h)',
      '--color-fd-card': 'rgb(0 0 0 / 50%)'
    };

    for (const preset of COLOR_PRESETS) {
      it(`keeps every override, after the ${preset} preset's own rules`, async () => {
        const output = await compiled(
          stylesheetFor({
            brand: { colors: { preset, primary: { light: '#1d4ed8', dark: '#93c5fd' } } },
            advanced: { tokens: { light: tokens, dark: tokens } }
          })
        );

        const light = output.indexOf(`${LIGHT_SELECTOR} {`);
        const dark = output.indexOf(`${DARK_SELECTOR} {`);
        expect(light, 'light rule').to.be.above(-1);
        expect(dark, 'dark rule').to.be.above(light);
        // Anything the preset sets outside `@theme` comes first, so equal specificity loses to these.
        for (const own of ['.dark #nd-sidebar {', '#nd-sidebar {', '.dark {']) {
          const at = output.indexOf(`\n${own}`);
          if (at !== -1) expect(at, own).to.be.below(light);
        }
        for (const [name, value] of Object.entries(tokens)) {
          expect(output.split(`${name}: ${value};`).length - 1, name).to.equal(2);
        }
      });
    }
  });

  it('writes the tokens after the primary, in the order written', () => {
    const css = stylesheetFor({
      brand: { colors: { primary: '#1d4ed8' } },
      advanced: { tokens: { dark: { '--color-fd-card': '#111', '--color-fd-accent': '#222' } } }
    });

    expect(ruleOf(css, DARK_SELECTOR)).to.deep.equal([
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

    expect(ruleOf(css, LIGHT_SELECTOR)).to.deep.equal([
      '--color-fd-primary: #1d4ed8;',
      '--color-fd-primary-foreground: hsl(0, 0%, 98%);',
      '--color-fd-ring: hsl(220, 100%, 64%);'
    ]);
  });

  it('keeps every import ahead of the rules, as CSS requires', () => {
    const css = stylesheetFor({ brand: { colors: { primary: '#1d4ed8' } } });
    const lastImport = css.lastIndexOf('@import');
    const firstRule = css.indexOf('{');

    expect(lastImport).to.be.below(firstRule);
    expect(css.endsWith('}\n')).to.be.true;
  });
});
