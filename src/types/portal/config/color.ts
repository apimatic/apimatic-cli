/** Channels between 0 and 1. */
interface Rgb {
  red: number;
  green: number;
  blue: number;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Hex only, which is how brand guidelines give a colour: the foreground laid over the primary is
 * chosen by contrast, which needs the colour's channels.
 */
export class Color {
  private constructor(private readonly written: string, private readonly rgb: Rgb) {}

  public static readonly formats = '#rgb or #rrggbb';

  /** The two foregrounds the neutral preset pairs with its own primaries. */
  private static readonly light = new Color('hsl(0, 0%, 98%)', { red: 0.98, green: 0.98, blue: 0.98 });
  private static readonly dark = new Color('hsl(0, 0%, 9%)', { red: 0.09, green: 0.09, blue: 0.09 });

  public static create(value: string): Color | undefined {
    const text = value.trim();
    if (!HEX.test(text)) {
      return undefined;
    }
    const digits = text.slice(1);
    const pairs = digits.length === 3 ? [...digits].map((digit) => digit + digit) : digits.match(/../g) ?? [];
    const [red, green, blue] = pairs.map((pair) => Number.parseInt(pair, 16) / 255);
    return new Color(text, { red, green, blue });
  }

  /** WCAG 2 relative luminance. */
  public luminance(): number {
    const linear = (channel: number) =>
      channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    return 0.2126 * linear(this.rgb.red) + 0.7152 * linear(this.rgb.green) + 0.0722 * linear(this.rgb.blue);
  }

  public contrastWith(other: Color): number {
    const [lighter, darker] = [this.luminance(), other.luminance()].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
  }

  public foreground(): Color {
    return this.contrastWith(Color.light) >= this.contrastWith(Color.dark) ? Color.light : Color.dark;
  }

  public toString(): string {
    return this.written;
  }
}
