import { Result } from 'neverthrow';
import { UrlPath } from '../../file/urlPath.js';
import { allOf, namespace, oneOf, Parsed, unknownKeys } from './fields.js';

export const BODY_FONTS = [
  'geist',
  'inter',
  'ibm-plex-sans',
  'roboto',
  'open-sans',
  'source-sans-3',
  'manrope',
  'dm-sans',
  'system'
] as const;

export const MONO_FONTS = [
  'geist-mono',
  'jetbrains-mono',
  'ibm-plex-mono',
  'fira-code',
  'source-code-pro',
  'system'
] as const;

export type BodyFont = (typeof BODY_FONTS)[number];
export type MonoFont = (typeof MONO_FONTS)[number];

/**
 * A Google Fonts family and the weight axis its CSS2 URL has to name. The axis differs per
 * family, and a range the family does not cover fails the whole stylesheet request: IBM Plex
 * Mono is static, so it takes a list. Checked against fonts.googleapis.com on 2026-09-23.
 */
interface GoogleFont {
  family: string;
  weights: string;
}

const GOOGLE_FONTS: Record<Exclude<BodyFont | MonoFont, 'system'>, GoogleFont> = {
  geist: { family: 'Geist', weights: '100..900' },
  inter: { family: 'Inter', weights: '100..900' },
  'ibm-plex-sans': { family: 'IBM Plex Sans', weights: '100..700' },
  roboto: { family: 'Roboto', weights: '100..900' },
  'open-sans': { family: 'Open Sans', weights: '300..800' },
  'source-sans-3': { family: 'Source Sans 3', weights: '200..900' },
  manrope: { family: 'Manrope', weights: '200..800' },
  'dm-sans': { family: 'DM Sans', weights: '100..1000' },
  'geist-mono': { family: 'Geist Mono', weights: '100..900' },
  'jetbrains-mono': { family: 'JetBrains Mono', weights: '100..800' },
  'ibm-plex-mono': { family: 'IBM Plex Mono', weights: '100;200;300;400;500;600;700' },
  'fira-code': { family: 'Fira Code', weights: '300..700' },
  'source-code-pro': { family: 'Source Code Pro', weights: '200..900' }
};

// Tailwind's own default stacks, which is what `system` means and what a web font falls back to.
const SANS_STACK =
  "ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'";
const MONO_STACK = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

const KNOWN = ['body', 'mono'];

export class Fonts {
  private constructor(private readonly body: BodyFont, private readonly mono: MonoFont) {}

  public static readonly defaults = new Fonts('geist', 'geist-mono');

  public static parse(value: unknown, path: string): Parsed<Fonts> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        Result.combineWithAllErrors([
          oneOf(data.body, `${path}.body`, BODY_FONTS, Fonts.defaults.body),
          oneOf(data.mono, `${path}.mono`, MONO_FONTS, Fonts.defaults.mono)
        ])
      ).map(([body, mono]) => new Fonts(body, mono))
    );
  }

  public bodyFamily(): string {
    return Fonts.family(this.body, SANS_STACK);
  }

  public monoFamily(): string {
    return Fonts.family(this.mono, MONO_STACK);
  }

  public googleFontsUrl(): UrlPath | null {
    const families = [this.body, this.mono].flatMap((id) => (id === 'system' ? [] : [GOOGLE_FONTS[id]]));
    if (families.length === 0) {
      return null;
    }
    const query = families
      .map(({ family, weights }) => `family=${family.replaceAll(' ', '+')}:wght@${weights}`)
      .join('&');
    return new UrlPath(`https://fonts.googleapis.com/css2?${query}&display=swap`);
  }

  public toJSON(): { body: BodyFont; mono: MonoFont } {
    return { body: this.body, mono: this.mono };
  }

  private static family(id: BodyFont | MonoFont, stack: string): string {
    return id === 'system' ? stack : `'${GOOGLE_FONTS[id].family}', ${stack}`;
  }
}
