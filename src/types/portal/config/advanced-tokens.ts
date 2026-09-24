import { err, ok, Result } from 'neverthrow';
import { allOf, namespace, nonEmptyString, Parsed, unknownKeys } from './fields.js';

/**
 * The tokens every Fumadocs preset sets once per colour mode. The status and diff colours are
 * left out: the presets declare them once for both modes, so a per-mode value has nowhere to go.
 */
export const MODE_TOKENS = [
  '--color-fd-background',
  '--color-fd-foreground',
  '--color-fd-muted',
  '--color-fd-muted-foreground',
  '--color-fd-popover',
  '--color-fd-popover-foreground',
  '--color-fd-card',
  '--color-fd-card-foreground',
  '--color-fd-border',
  '--color-fd-primary',
  '--color-fd-primary-foreground',
  '--color-fd-secondary',
  '--color-fd-secondary-foreground',
  '--color-fd-accent',
  '--color-fd-accent-foreground',
  '--color-fd-ring',
  '--color-fd-overlay'
] as const;

type Tokens = ReadonlyMap<string, string>;

/**
 * `portal.advanced.tokens`: raw overrides of the preset's tokens, one set per mode. Values
 * are passed through as written: only the names are checked, and that each value is one value.
 */
export class AdvancedTokens {
  private constructor(private readonly light: Tokens, private readonly dark: Tokens) {}

  public static readonly defaults = new AdvancedTokens(new Map(), new Map());

  /** `value` is the whole `portal.advanced` namespace, of which the tokens are all there is. */
  public static parse(value: unknown, path: string): Parsed<AdvancedTokens> {
    return namespace(value, path).andThen((advanced) =>
      allOf(
        unknownKeys(advanced, ['tokens'], path),
        Result.combineWithAllErrors([AdvancedTokens.parseTokens(advanced.tokens, `${path}.tokens`)])
      ).map(([tokens]) => tokens)
    );
  }

  private static parseTokens(value: unknown, path: string): Parsed<AdvancedTokens> {
    return namespace(value, path).andThen((tokens) =>
      allOf(
        unknownKeys(tokens, ['light', 'dark'], path),
        Result.combineWithAllErrors([
          AdvancedTokens.parseMode(tokens.light, `${path}.light`),
          AdvancedTokens.parseMode(tokens.dark, `${path}.dark`)
        ])
      ).map(([light, dark]) => new AdvancedTokens(light, dark))
    );
  }

  /** The overrides for light mode, by custom-property name, in the order written. */
  public lightTokens(): Tokens {
    return this.light;
  }

  public darkTokens(): Tokens {
    return this.dark;
  }

  public toJSON(): { tokens: { light: Record<string, string>; dark: Record<string, string> } } {
    return { tokens: { light: Object.fromEntries(this.light), dark: Object.fromEntries(this.dark) } };
  }

  private static parseMode(value: unknown, path: string): Parsed<Tokens> {
    return namespace(value, path).andThen((data) => {
      const errors: string[] = [];
      const tokens = new Map<string, string>();
      for (const [name, token] of Object.entries(data)) {
        if (!(MODE_TOKENS as readonly string[]).includes(name)) {
          errors.push(
            `'${path}.${name}' is not a token the preset sets per colour mode; name one of ${MODE_TOKENS.map(
              (known) => `'${known}'`
            ).join(', ')}.`
          );
          continue;
        }
        const parsed = nonEmptyString(token, `${path}.${name}`).andThen((value) =>
          AdvancedTokens.cssValue(value, `${path}.${name}`)
        );
        if (parsed.isErr()) {
          errors.push(...parsed.error);
        } else {
          tokens.set(name, parsed.value);
        }
      }
      return errors.length > 0 ? err(errors) : ok(tokens);
    });
  }

  // The value is written into the generated stylesheet as it stands. Refusing only what ends a
  // declaration was not enough: an unclosed parenthesis, bracket or quote, or a trailing
  // backslash, carries the value past its own declaration, and the build either fails naming
  // no setting or drops both colour-mode blocks. Every CSS colour, `var()`, `calc()` and
  // relative colour syntax included, is written with these characters alone.
  private static cssValue(value: string, path: string): Parsed<string> {
    return /^[-A-Za-z0-9#%.,()/*+_ \t]+$/.test(value) && !value.includes('/*') && balanced(value)
      ? ok(value)
      : err([
          `'${path}' must be a single CSS value, such as '#1d4ed8' or 'oklch(0.6 0.2 260)': letters, digits, ` +
            `spaces and '# % . , ( ) / * + - _', with every parenthesis closed and no comment.`
        ]);
  }
}

function balanced(value: string): boolean {
  let depth = 0;
  for (const character of value) {
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
    }
  }
  return depth === 0;
}
