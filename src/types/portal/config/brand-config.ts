import { err, ok, Result } from 'neverthrow';
import { Color } from './color.js';
import { allOf, LightDark, lightDark, namespace, oneOf, optional, Parsed, unknownKeys } from './fields.js';
import { Fonts } from './fonts.js';
import { StaticAsset } from './static-asset.js';

/** Fumadocs' standalone theme files. `shadcn` is left out: it maps every token to a host application's own variables. */
export const COLOR_PRESETS = [
  'neutral',
  'black',
  'vitepress',
  'dusk',
  'catppuccin',
  'ocean',
  'purple',
  'solar',
  'emerald',
  'ruby',
  'aspen'
] as const;

export type ColorPreset = (typeof COLOR_PRESETS)[number];

export const COLOR_MODES = ['light', 'dark', 'both'] as const;

export type ColorMode = (typeof COLOR_MODES)[number];

const KNOWN = ['logo', 'favicon', 'colors', 'fonts', 'colorMode'];

const KNOWN_COLORS = ['preset', 'primary'];

export class Logo {
  private constructor(private readonly images: LightDark<StaticAsset>) {}

  public static parse(value: unknown, path: string): Parsed<Logo> {
    return lightDark(value, path, StaticAsset.parse).map((images) => new Logo(images));
  }

  public light(): StaticAsset {
    return this.images.light;
  }

  public dark(): StaticAsset {
    return this.images.dark;
  }

  public files(): StaticAsset[] {
    return this.images.light.isEqual(this.images.dark) ? [this.images.light] : [this.images.light, this.images.dark];
  }

  public toJSON(): string | { light: string; dark: string } {
    const { light, dark, single } = this.images;
    return single ? light.toJSON() : { light: light.toJSON(), dark: dark.toJSON() };
  }
}

export class BrandColors {
  private constructor(private readonly preset: ColorPreset, private readonly primary: LightDark<Color> | null) {}

  public static readonly defaults = new BrandColors('neutral', null);

  public static parse(value: unknown, path: string): Parsed<BrandColors> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN_COLORS, path),
        Result.combineWithAllErrors([
          oneOf(data.preset, `${path}.preset`, COLOR_PRESETS, BrandColors.defaults.preset),
          optional(data.primary, (primary) => lightDark(primary, `${path}.primary`, BrandColors.parseColor))
        ])
      ).map(([preset, primary]) => new BrandColors(preset, primary))
    );
  }

  public presetName(): ColorPreset {
    return this.preset;
  }

  /** The primary for each mode, or null when the preset's own applies. */
  public primaryColors(): { light: Color; dark: Color } | null {
    return this.primary === null ? null : { light: this.primary.light, dark: this.primary.dark };
  }

  public toJSON(): { preset: ColorPreset; primary?: string | { light: string; dark: string } } {
    if (this.primary === null) {
      return { preset: this.preset };
    }
    const { light, dark, single } = this.primary;
    return {
      preset: this.preset,
      primary: single ? light.toString() : { light: light.toString(), dark: dark.toString() }
    };
  }

  private static parseColor(value: unknown, path: string): Parsed<Color> {
    const color = typeof value === 'string' ? Color.create(value) : undefined;
    return color === undefined
      ? err([`'${path}' must be a colour written as ${Color.formats}, for example '#1d4ed8'.`])
      : ok(color);
  }
}

export class BrandConfig {
  private constructor(
    private readonly logo: Logo | null,
    private readonly favicon: StaticAsset | null,
    private readonly colors: BrandColors,
    private readonly fonts: Fonts,
    private readonly colorMode: ColorMode
  ) {}

  public static readonly defaults = new BrandConfig(null, null, BrandColors.defaults, Fonts.defaults, 'both');

  public static parse(value: unknown, path: string): Parsed<BrandConfig> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        Result.combineWithAllErrors([
          optional(data.logo, (logo) => Logo.parse(logo, `${path}.logo`)),
          optional(data.favicon, (favicon) => StaticAsset.parse(favicon, `${path}.favicon`)),
          BrandColors.parse(data.colors, `${path}.colors`),
          Fonts.parse(data.fonts, `${path}.fonts`),
          oneOf(data.colorMode, `${path}.colorMode`, COLOR_MODES, BrandConfig.defaults.colorMode)
        ])
      ).map(([logo, favicon, colors, fonts, colorMode]) => new BrandConfig(logo, favicon, colors, fonts, colorMode))
    );
  }

  public logoImages(): Logo | null {
    return this.logo;
  }

  public faviconImage(): StaticAsset | null {
    return this.favicon ?? this.logo?.light() ?? null;
  }

  public brandColors(): BrandColors {
    return this.colors;
  }

  public brandFonts(): Fonts {
    return this.fonts;
  }

  public mode(): ColorMode {
    return this.colorMode;
  }

  public files(): StaticAsset[] {
    const logos = this.logo?.files() ?? [];
    const favicon = this.favicon;
    return favicon === null || logos.some((logo) => logo.isEqual(favicon)) ? logos : [...logos, favicon];
  }

  public toJSON(): {
    logo?: ReturnType<Logo['toJSON']>;
    favicon?: string;
    colors: ReturnType<BrandColors['toJSON']>;
    fonts: ReturnType<Fonts['toJSON']>;
    colorMode: ColorMode;
  } {
    return {
      ...(this.logo === null ? {} : { logo: this.logo.toJSON() }),
      ...(this.favicon === null ? {} : { favicon: this.favicon.toJSON() }),
      colors: this.colors.toJSON(),
      fonts: this.fonts.toJSON(),
      colorMode: this.colorMode
    };
  }
}
