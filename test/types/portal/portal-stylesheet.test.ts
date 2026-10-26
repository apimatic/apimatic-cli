import fs from 'fs';
import path from 'path';
import { expect } from 'chai';
import { compile } from 'tailwindcss';
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

  // Nothing overrides the theme's colours, so no rule is written for either mode.
  it('writes nothing but its header for an empty block', () => {
    expect(stylesheetFor({})).to.match(/^\/\*[^\n]*\*\/\n$/);
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

  // A bare `:root` has the specificity of the theme's `.dark` block and comes after it, so a
  // colour meant for light mode would win in dark mode as well.
  it('scopes the light rule away from dark mode', () => {
    const css = stylesheetFor({ brand: { colors: { primary: '#1d4ed8' } } });

    expect(LIGHT_SELECTOR).to.equal(':root:not(.dark)');
    expect(css).to.contain(`\n${LIGHT_SELECTOR} {\n`);
    expect(css).to.not.match(/^:root \{/m);
  });

  describe('compiled as the build compiles it', () => {
    const styles = path.resolve('portal-template', 'src', 'styles');

    /**
     * The stylesheet through Tailwind, after Tailwind's own and the neutral theme, as `app.css`
     * has them, with every import read from the installed packages. The Fumadocs presets
     * `app.css` also imports set no colour outside `@theme`, and one of them loads a plugin, so
     * they are left out.
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
      const app = "@import 'tailwindcss';\n@import 'fumadocs-ui/css/neutral.css';\n@import './theme.css';\n";
      return (await compile(app, { base: styles, loadStylesheet })).build([]);
    };

    it("keeps each mode's primary, after the neutral theme's own rules", async () => {
      const output = await compiled(
        stylesheetFor({ brand: { colors: { primary: { light: '#1d4ed8', dark: '#93c5fd' } } } })
      );

      const light = output.indexOf(`\n${LIGHT_SELECTOR} {`);
      const dark = output.indexOf(`\n${DARK_SELECTOR} {`, light);
      expect(light, 'light rule').to.be.above(-1);
      expect(dark, 'dark rule').to.be.above(light);
      // What the theme sets outside `@theme` comes first, so equal specificity loses to these.
      expect(output.indexOf('\n.dark {')).to.be.above(-1).and.below(light);
      expect(output.slice(light, dark)).to.contain('--color-fd-primary: #1d4ed8;');
      expect(output.slice(dark)).to.contain('--color-fd-primary: #93c5fd;');
    });
  });
});
