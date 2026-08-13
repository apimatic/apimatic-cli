export const removeQuotes = (input: string): string => {
  const quotes = ['"', "'"];

  for (const quote of quotes) {
    if (input.startsWith(quote) && input.endsWith(quote) && input.length > 1) {
      return removeQuotes(input.slice(1, -1)); // Recursive call
    }
  }
  return input;
};

/** Lower-case kebab-case — the shape a plugin id must take to pass server-side validation. */
export const toKebabCase = (input: string): string =>
  input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

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
