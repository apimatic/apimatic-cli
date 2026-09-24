import { Color } from './config/color.js';
import { PortalConfig } from './portal-config.js';

const HEADER = "/* Written by the APIMatic CLI from the 'portal' block of src/apimatic.json. Edit that instead. */";

/**
 * Scoped with `:not(.dark)`: a bare `:root` has the specificity of the theme's `.dark` block and
 * comes after it, so a colour meant for light mode would win in dark mode too.
 */
export const LIGHT_SELECTOR = ':root:not(.dark)';
export const DARK_SELECTOR = '.dark';

/**
 * The build project's `src/styles/theme.css`. `app.css` imports it after the Fumadocs theme,
 * so what it sets comes last. A file of its own rather than a substitution, so `portal serve`
 * can rewrite it whole when the block changes; rendered here so the CSS is tested without a build.
 */
export class PortalStylesheet {
  private constructor(private readonly primary: { light: Color; dark: Color } | null) {}

  public static of(config: PortalConfig): PortalStylesheet {
    return new PortalStylesheet(config.brandSettings().brandColors().primaryColors());
  }

  public toString(): string {
    const rules =
      this.primary === null
        ? []
        : [
            PortalStylesheet.rule(LIGHT_SELECTOR, this.primary.light),
            PortalStylesheet.rule(DARK_SELECTOR, this.primary.dark)
          ];
    return [HEADER, ...rules].join('\n\n').concat('\n');
  }

  private static rule(selector: string, primary: Color): string {
    const declarations = [
      ['--color-fd-primary', primary.toString()],
      ['--color-fd-primary-foreground', primary.foreground().toString()],
      ['--color-fd-ring', primary.toString()]
    ];
    const body = declarations.map(([name, value]) => `  ${name}: ${value};`).join('\n');
    return `${selector} {\n${body}\n}`;
  }
}
