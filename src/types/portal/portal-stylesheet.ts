import { Color } from './config/color.js';
import { PortalConfig } from './portal-config.js';

/** For whoever opens the build project: where the file came from, and where to change it. */
const HEADER = "/* Written by the APIMatic CLI from the 'portal' block of src/apimatic.json. Edit that instead. */";

/**
 * The light rule is scoped with `:not(.dark)`: a bare `:root` has the specificity of the
 * presets' `.dark` block and comes after it, so a colour meant for light mode would win in dark
 * mode too. Each rule also names the sidebar, which every layout renders as `#nd-sidebar` and
 * which some presets give tokens of its own -- neutral's muted and secondary in dark mode,
 * catppuccin's in both -- with an id that outranks either mode's rule.
 */
export const LIGHT_SELECTOR = ':root:not(.dark), :root:not(.dark) #nd-sidebar';
export const DARK_SELECTOR = '.dark, .dark #nd-sidebar';

type Declarations = ReadonlyMap<string, string>;

/**
 * The build project's `src/styles/theme.css`: the colour preset, the fonts and the colours the
 * `portal` block asks for. `app.css` imports it after the Fumadocs presets, so what it sets
 * comes last. A file of its own rather than a substitution, so `portal serve` can rewrite it
 * whole when the block changes; rendered here so the CSS is tested without a build.
 */
export class PortalStylesheet {
  private constructor(
    private readonly imports: readonly string[],
    private readonly fontFamilies: Declarations,
    private readonly light: Declarations,
    private readonly dark: Declarations
  ) {}

  public static of(config: PortalConfig): PortalStylesheet {
    const brand = config.brandSettings();
    const fonts = brand.brandFonts();
    const primary = brand.brandColors().primaryColors();
    const tokens = config.tokenOverrides();

    // Glass is the one layout `preset.css` leaves out; its utility classes are scanned from here.
    const imports = [
      `fumadocs-ui/css/${brand.brandColors().presetName()}.css`,
      ...(config.navigationSettings().layoutName() === 'glass' ? ['fumadocs-ui/css/generated/glass.css'] : [])
    ];

    return new PortalStylesheet(
      imports,
      new Map([
        ['--default-font-family', fonts.bodyFamily()],
        ['--default-mono-font-family', fonts.monoFamily()]
      ]),
      PortalStylesheet.modeDeclarations(primary?.light, tokens.lightTokens()),
      PortalStylesheet.modeDeclarations(primary?.dark, tokens.darkTokens())
    );
  }

  /** A mode with nothing to set gets no rule at all. */
  public toString(): string {
    return [
      HEADER,
      this.imports.map((specifier) => `@import '${specifier}';`).join('\n'),
      PortalStylesheet.rule('@theme', this.fontFamilies),
      PortalStylesheet.rule(LIGHT_SELECTOR, this.light),
      PortalStylesheet.rule(DARK_SELECTOR, this.dark)
    ]
      .filter((section) => section !== '')
      .join('\n\n')
      .concat('\n');
  }

  /**
   * What one mode sets: the primary trio first, then the raw tokens. A token naming one of the
   * trio replaces it in place, so each property is declared once and the token still wins.
   */
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
