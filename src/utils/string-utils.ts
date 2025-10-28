export const removeQuotes = (input: string): string => {
  const quotes = ['"', "'"];

  for (const quote of quotes) {
    if (input.startsWith(quote) && input.endsWith(quote) && input.length > 1) {
      return removeQuotes(input.slice(1, -1)); // Recursive call
    }
  }
  return input;
};

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

export function toTitleCase(str: string): string {
  if (str === '') {
    return '';
  }

  let result = '';
  let shouldCapitalizeNext = true;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : '';

    if (isLowercase(char)) {
      result += shouldCapitalizeNext ? ' ' + char.toUpperCase() : char;
      shouldCapitalizeNext = false;
    } else if (isUppercase(char)) {
      if (prevChar && !isUppercase(prevChar)) {
        result += ' ';
      }
      result += char;
      shouldCapitalizeNext = false;
    } else if (isDigit(char)) {
      if (prevChar && !isDigit(prevChar)) {
        result += ' ';
      }
      result += char;
      shouldCapitalizeNext = true;
    } else {
      shouldCapitalizeNext = true;
    }
  }

  return result.trim();
}

function isLowercase(char: string): boolean {
  return char >= 'a' && char <= 'z';
}

function isUppercase(char: string): boolean {
  return char >= 'A' && char <= 'Z';
}

function isDigit(char: string): boolean {
  return char.length === 1 && char >= '0' && char <= '9';
}
