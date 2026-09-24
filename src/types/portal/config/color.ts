/** Channels between 0 and 1. */
interface Rgb {
  red: number;
  green: number;
  blue: number;
}

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const PERCENTAGE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))%$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const HUE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(deg|grad|rad|turn)?$/i;

const HUE_UNITS: Record<string, number> = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };

interface Channels {
  values: string[];
  alpha: string | undefined;
  /** The comma-separated form, which CSS holds to stricter rules than the space-separated one. */
  legacy: boolean;
}

/**
 * Only these forms are accepted, rather than any CSS colour, because the foreground laid over
 * the primary is chosen by contrast, which needs the colour's channels.
 */
export class Color {
  private constructor(private readonly written: string, private readonly rgb: Rgb) {}

  public static readonly formats = '#rgb, #rrggbb, #rrggbbaa, rgb() or hsl()';

  /** The two foregrounds the neutral preset pairs with its own primaries. */
  private static readonly light = new Color('hsl(0, 0%, 98%)', hslToRgb(0, 0, 0.98));
  private static readonly dark = new Color('hsl(0, 0%, 9%)', hslToRgb(0, 0, 0.09));

  public static create(value: string): Color | undefined {
    const text = value.trim();
    const rgb = Color.parseHex(text) ?? Color.parseFunction(text);
    return rgb === undefined ? undefined : new Color(text, rgb);
  }

  /** WCAG 2 relative luminance. Alpha is left out: what shows through is not known here. */
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

  private static parseHex(text: string): Rgb | undefined {
    if (!HEX.test(text)) {
      return undefined;
    }
    const digits = text.slice(1);
    const pairs = digits.length === 3 ? [...digits].map((digit) => digit + digit) : digits.match(/../g);
    const [red, green, blue] = (pairs ?? []).map((pair) => Number.parseInt(pair, 16) / 255);
    return { red, green, blue };
  }

  private static parseFunction(text: string): Rgb | undefined {
    const match = /^(rgba?|hsla?)\((.*)\)$/i.exec(text);
    if (match === null) {
      return undefined;
    }
    const parts = Color.channels(match[2]);
    if (parts === undefined || (parts.alpha !== undefined && !Color.validAlpha(parts.alpha))) {
      return undefined;
    }
    return match[1].toLowerCase().startsWith('rgb') ? Color.rgbChannels(parts) : Color.hslChannels(parts);
  }

  private static channels(inner: string): Channels | undefined {
    const trimmed = inner.trim();
    if (trimmed.includes(',')) {
      const values = trimmed.split(',').map((part) => part.trim());
      return values.length === 3 || values.length === 4
        ? { values: values.slice(0, 3), alpha: values[3], legacy: true }
        : undefined;
    }
    const [main, alpha, ...rest] = trimmed.split('/').map((part) => part.trim());
    const values = main.split(/\s+/);
    return rest.length === 0 && values.length === 3 ? { values, alpha, legacy: false } : undefined;
  }

  // The comma form takes three numbers or three percentages; a browser drops a mix of the two
  // as invalid, and every use of the primary with it.
  private static rgbChannels({ values, legacy }: Channels): Rgb | undefined {
    const percentages = values.map((value) => PERCENTAGE.exec(value));
    if (legacy && new Set(percentages.map((percentage) => percentage === null)).size > 1) {
      return undefined;
    }
    const channels = values.map((value, index) => {
      const percentage = percentages[index];
      if (percentage !== null) {
        return Color.within(Number(percentage[1]), 100);
      }
      return NUMBER.test(value) ? Color.within(Number(value), 255) : undefined;
    });
    if (channels.includes(undefined)) {
      return undefined;
    }
    const [red, green, blue] = channels as number[];
    return { red, green, blue };
  }

  // Saturation and lightness are percentages in the comma form, and may also be bare numbers,
  // read as percentages, in the space form.
  private static hslChannels({ values: [hue, saturation, lightness], legacy }: Channels): Rgb | undefined {
    const angle = HUE.exec(hue);
    const sFraction = Color.percentage(saturation, legacy);
    const lFraction = Color.percentage(lightness, legacy);
    if (angle === null || sFraction === undefined || lFraction === undefined) {
      return undefined;
    }
    const degrees = Number(angle[1]) * HUE_UNITS[(angle[2] ?? 'deg').toLowerCase()];
    return hslToRgb(degrees, sFraction, lFraction);
  }

  private static percentage(value: string, legacy: boolean): number | undefined {
    const percentage = PERCENTAGE.exec(value);
    if (percentage !== null) {
      return Color.within(Number(percentage[1]), 100);
    }
    return !legacy && NUMBER.test(value) ? Color.within(Number(value), 100) : undefined;
  }

  private static validAlpha(alpha: string): boolean {
    const percentage = PERCENTAGE.exec(alpha);
    if (percentage !== null) {
      return Color.within(Number(percentage[1]), 100) !== undefined;
    }
    return NUMBER.test(alpha) && Color.within(Number(alpha), 1) !== undefined;
  }

  private static within(value: number, scale: number): number | undefined {
    return value >= 0 && value <= scale ? value / scale : undefined;
  }
}

/** The conversion CSS Color 4 specifies, with saturation and lightness as fractions. */
function hslToRgb(degrees: number, saturation: number, lightness: number): Rgb {
  const hue = ((degrees % 360) + 360) % 360;
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    return lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { red: channel(0), green: channel(8), blue: channel(4) };
}
