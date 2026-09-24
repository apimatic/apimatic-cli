import { Color } from './config/color.js';
import { PortalConfig } from './portal-config.js';

const HEADER = "/* Written by the APIMatic CLI from the 'portal' block of src/apimatic.json. Edit that instead. */";

/**
 * The light rule is scoped with `:not(.dark)`: a bare `:root` has the specificity of the
 * theme's `.dark` block and comes after it, so a colour meant for light mode would win in dark
 * mode too. Each rule also names the sidebar, which the layout renders as `#nd-sidebar` and to
 * which the neutral theme gives muted and secondary tokens of its own in dark mode, with an id
 * that outranks either mode's rule.
 */
export const LIGHT_SELECTOR = ':root:not(.dark), :root:not(.dark) #nd-sidebar';
export const DARK_SELECTOR = '.dark, .dark #nd-sidebar';

type Declarations = ReadonlyMap<string, string>;

/**
 * The build project's `src/styles/theme.css`. `app.css` imports it after the Fumadocs theme,
 * so what it sets comes last. A file of its own rather than a substitution, so `portal serve`
 * can rewrite it whole when the block changes; rendered here so the CSS is tested without a build.
 */
export class PortalStylesheet {
  private constructor(private readonly light: Declarations, private readonly dark: Declarations) {}

  public static of(config: PortalConfig): PortalStylesheet {
    const primary = config.brandSettings().brandColors().primaryColors();
    const tokens = config.tokenOverrides();

    return new PortalStylesheet(
      PortalStylesheet.modeDeclarations(primary?.light, tokens.lightTokens()),
      PortalStylesheet.modeDeclarations(primary?.dark, tokens.darkTokens())
    );
  }

  public toString(): string {
    return [HEADER, PortalStylesheet.rule(LIGHT_SELECTOR, this.light), PortalStylesheet.rule(DARK_SELECTOR, this.dark)]
      .filter((section) => section !== '')
      .join('\n\n')
      .concat('\n');
  }

  // A token naming one of the primary trio replaces it in place, so each property is declared
  // once and the token still wins.
  private static modeDeclarations(primary: Color | undefined, tokens: Declarations): Declarations {
    const declarations = new Map<string, string>();
    if (primary !== undefined) {
      declarations.set('--color-fd-primary', primary.toString());
      declarations.set('--color-fd-primary-foreground', primary.foreground().toString());
      declarations.set('--color-fd-ring', primary.toString());
    }
    for (const [name, value] of tokens) {
      declarations.set(name, value);
    }
    return declarations;
  }

  private static rule(selector: string, declarations: Declarations): string {
    if (declarations.size === 0) {
      return '';
    }
    const body = [...declarations].map(([name, value]) => `  ${name}: ${value};`).join('\n');
    return `${selector} {\n${body}\n}`;
  }
}
