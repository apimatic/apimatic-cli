const LOWER_TO_UPPER = 'a'.charCodeAt(0) - 'A'.charCodeAt(0);

/** Letters a to z alone: the names compared this way are RFC 9110 tokens, and a full case mapping would turn `ß` into two letters. */
export function asciiUpperCase(text: string): string {
  return Array.from(text, (character) =>
    character >= 'a' && character <= 'z' ? String.fromCharCode(character.charCodeAt(0) - LOWER_TO_UPPER) : character
  ).join('');
}

export function asciiLowerCase(text: string): string {
  return Array.from(text, (character) =>
    character >= 'A' && character <= 'Z' ? String.fromCharCode(character.charCodeAt(0) + LOWER_TO_UPPER) : character
  ).join('');
}

export function equalsIgnoringAsciiCase(first: string, second: string): boolean {
  return first.length === second.length && asciiUpperCase(first) === asciiUpperCase(second);
}

/** By UTF-16 code unit, as every list in a report is ordered: the same on every machine, whatever its locale. */
export function compareOrdinal(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

export function compareIgnoringAsciiCase(first: string, second: string): number {
  return compareOrdinal(asciiUpperCase(first), asciiUpperCase(second));
}
