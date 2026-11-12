interface CanonicalNumber {
  readonly negative: boolean;
  readonly digits: string;
  readonly exponent: bigint;
}

/**
 * Whether two JSON numbers are one value, decided on their text: a double rounds
 * `9007199254740993` to its neighbour and `1e-30` towards nothing, so no number type is asked.
 */
export function sameNumber(first: string, second: string): boolean {
  const one = canonical(first);
  const other = canonical(second);
  return one.negative === other.negative && one.digits === other.digits && one.exponent === other.exponent;
}

/**
 * The sign, the significant digits and the exponent that puts the point before the first of them:
 * `-120.50e1`, `-1205` and `-0.1205E+4` are all (negative, 1205, 4). Zero is one form under any
 * sign or spelling. The exponent is a bigint because JSON puts no bound on it.
 */
function canonical(number: string): CanonicalNumber {
  const negative = number.startsWith('-');
  const unsigned = negative ? number.slice(1) : number;
  const exponentAt = unsigned.toLowerCase().indexOf('e');
  const mantissa = exponentAt < 0 ? unsigned : unsigned.slice(0, exponentAt);
  const exponent = exponentAt < 0 ? 0n : BigInt(withoutPlus(unsigned.slice(exponentAt + 1)));
  const [whole, fraction = ''] = mantissa.split('.');
  const fromFirstSignificant = trimStart(whole + fraction, '0');
  const digits = trimEnd(fromFirstSignificant, '0');
  const leadingZeros = whole.length + fraction.length - fromFirstSignificant.length;
  return digits.length === 0
    ? { negative: false, digits: '', exponent: 0n }
    : { negative, digits, exponent: exponent + BigInt(whole.length - leadingZeros) };
}

/** A decimal number holds 28 digits for certain; nothing the mock reads as a whole number is longer. */
const MAX_WHOLE_DIGITS = 28;

/**
 * The number written as plain digits when it is a whole number, whatever its spelling: `200.0`
 * and `2e2` are 200, as JSON Schema counts them. Nothing for a number with a fraction, or one
 * too long to be a status, a count or a second.
 */
export function wholeNumberText(number: string): string | undefined {
  const { negative, digits, exponent } = canonical(number);
  if (digits.length === 0) {
    return '0';
  }
  if (exponent < BigInt(digits.length) || exponent > BigInt(MAX_WHOLE_DIGITS)) {
    return undefined;
  }
  return (negative ? '-' : '') + digits.padEnd(Number(exponent), '0');
}

const withoutPlus = (exponent: string): string => (exponent.startsWith('+') ? exponent.slice(1) : exponent);

function trimStart(text: string, character: string): string {
  let start = 0;
  while (text[start] === character) {
    start += 1;
  }
  return text.slice(start);
}

function trimEnd(text: string, character: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === character) {
    end -= 1;
  }
  return text.slice(0, end);
}
