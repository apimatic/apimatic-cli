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
  let result = "";
  let i = 0;

  while (i < str.length) {
    const char = str[i];
    // Detect ESC (0x1B)
    if (char === "\x1B" && str[i + 1] === "[") {
      // We’re at the start of an ANSI sequence. Skip until 'm' or end.
      i += 2; // skip ESC[
      while (i < str.length && str[i] !== "m") {
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
  if (str === "") return "";

  let result = "";
  let shouldCapitalizeNext = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : "";

    if (isLowercase(char)) {
      const processed = processLowercase(char, shouldCapitalizeNext);
      result += processed.text;
      shouldCapitalizeNext = processed.capitalizeNext;
    } else if (isUppercase(char)) {
      const processed = processUppercase(char, prevChar);
      result += processed.text;
      shouldCapitalizeNext = processed.capitalizeNext;
    } else if (isDigit(char)) {
      const processed = processDigit(char, prevChar);
      result += processed.text;
      shouldCapitalizeNext = processed.capitalizeNext;
    } else {
      shouldCapitalizeNext = true;
    }
  }
  result = result.charAt(0).toUpperCase() + result.slice(1);
  return result.trimStart();
}

function processLowercase(
  char: string,
  shouldCapitalize: boolean
): { text: string; capitalizeNext: boolean } {
  if (shouldCapitalize) {
    return { text: " " + char.toUpperCase(), capitalizeNext: false };
  }
  return { text: char, capitalizeNext: false };
}

function processUppercase(
  char: string,
  prevChar: string
): { text: string; capitalizeNext: boolean } {
  const needsSpace = prevChar && !isUppercase(prevChar);
  return { text: needsSpace ? " " + char : char, capitalizeNext: false };
}

function processDigit(
  char: string,
  prevChar: string
): { text: string; capitalizeNext: boolean } {
  const needsSpace = prevChar && !isDigit(prevChar);
  return { text: needsSpace ? " " + char : char, capitalizeNext: true };
}

function isLowercase(char: string): boolean {
  return char >= "a" && char <= "z";
}

function isUppercase(char: string): boolean {
  return char >= "A" && char <= "Z";
}

function isDigit(char: string): boolean {
  return char.length === 1 && char >= "0" && char <= "9";
}
