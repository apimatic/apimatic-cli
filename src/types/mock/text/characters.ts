export const isAsciiDigit = (character: string): boolean =>
  character.length === 1 && character >= '0' && character <= '9';

export const isHexDigit = (character: string): boolean =>
  isAsciiDigit(character) ||
  (character.length === 1 && ((character >= 'a' && character <= 'f') || (character >= 'A' && character <= 'F')));

export const isAsciiLetter = (character: string): boolean =>
  character.length === 1 && ((character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z'));

export const isHighSurrogate = (codeUnit: number): boolean => codeUnit >= 0xd800 && codeUnit <= 0xdbff;

export const isLowSurrogate = (codeUnit: number): boolean => codeUnit >= 0xdc00 && codeUnit <= 0xdfff;

/** Whether every surrogate has its pair; half of one is no character, and UTF-8 cannot carry it. */
export function isWellFormed(text: string): boolean {
  for (let at = 0; at < text.length; at++) {
    const paired = isHighSurrogate(text.charCodeAt(at)) && isLowSurrogate(text.charCodeAt(at + 1));
    if (!paired && (isHighSurrogate(text.charCodeAt(at)) || isLowSurrogate(text.charCodeAt(at)))) {
      return false;
    }
    at += paired ? 1 : 0;
  }
  return true;
}

export const isAllDigits = (text: string): boolean => text.length > 0 && Array.from(text).every(isAsciiDigit);

/** What every HTTP client and server lets through in a header value; the one copy of the range. */
export const isPrintableAscii = (text: string): boolean =>
  Array.from(text).every((character) => character >= ' ' && character <= '~');

/** RFC 9110 section 5.6.2: `token = 1*tchar`. */
export const isToken = (text: string): boolean =>
  text.length > 0 &&
  Array.from(text).every(
    (character) => isAsciiLetter(character) || isAsciiDigit(character) || "!#$%&'*+-.^_`|~".includes(character)
  );
