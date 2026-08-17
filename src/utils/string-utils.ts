export const removeQuotes = (input: string): string => {
  const quotes = ['"', "'"];

  for (const quote of quotes) {
    if (input.startsWith(quote) && input.endsWith(quote) && input.length > 1) {
      return removeQuotes(input.slice(1, -1)); // Recursive call
    }
  }
  return input;
};

/**
 * Splits on case boundaries, digits and any run of separators at once. Matching the words rather
 * than replacing the gaps is what keeps leading, trailing and repeated separators from surviving as
 * stray dashes, and it keeps an acronym followed by a word — `APIMatic` — from splitting per letter.
 */
const KEBAB_CASE_WORD = /[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g;

/** Lower-case kebab-case — the shape a plugin id must take to pass server-side validation. */
export const toKebabCase = (input: string): string =>
  (input.match(KEBAB_CASE_WORD) ?? []).map((word) => word.toLowerCase()).join('-');

/** Start case: every word is capitalised with no small-word exceptions, and keeps its own tail casing. */
export const toTitleCase = (input: string): string =>
  input
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export function stripAnsi(str: string) {
  let result = '';
  let i = 0;

  while (i < str.length) {
    const char = str[i];
    // Detect ESC (0x1B)
    if (char === '\x1B' && str[i + 1] === '[') {
      // We’re at the start of an ANSI sequence. Skip until 'm' or end.
      i += 2; // skip ESC[
      while (i < str.length && str[i] !== 'm') {
        i++;
      }
      // Skip the 'm' itself
      i++;
    } else if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) {
      // Skip other control chars (optional)
      i++;
    } else {
      // Normal printable char — keep it
      result += char;
      i++;
    }
  }
  return result;
}
