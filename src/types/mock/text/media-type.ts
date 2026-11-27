import { asciiLowerCase } from './ascii.js';
import { isToken } from './characters.js';

/** A header value of the form `value; name=value; name="quoted value"`, as Content-Type and Content-Disposition are written. */
export interface ParameterizedValue {
  /** What stands before the first `;`, trimmed and as written. */
  readonly value: string;
  /** By lower-case name; a quoted value without its quotes. The first of a name given twice counts. */
  readonly parameters: ReadonlyMap<string, string>;
}

/** A Content-Type value read as RFC 9110 section 8.3.1 writes it. */
export interface MediaType {
  /** `type/subtype` in lower case. */
  readonly essence: string;
  readonly parameters: ReadonlyMap<string, string>;
}

/** Nothing for a value whose parameters are not `name=value` pairs, so a caller never acts on half of one. */
export function parseParameterizedValue(text: string): ParameterizedValue | undefined {
  const [value, ...segments] = splitOutsideQuotes(text, ';').map((segment) => segment.trim());
  const parameters = new Map<string, string>();
  for (const segment of segments.filter((each) => each.length > 0)) {
    const equals = segment.indexOf('=');
    const name = asciiLowerCase(segment.slice(0, Math.max(equals, 0)).trim());
    const parameter = unquoted(segment.slice(equals + 1).trim());
    if (!isToken(name) || parameter === undefined) {
      return undefined;
    }
    if (!parameters.has(name)) {
      parameters.set(name, parameter);
    }
  }
  return { value, parameters };
}

export function parseMediaType(text: string): MediaType | undefined {
  const read = parseParameterizedValue(text);
  const [type, subtype, ...more] = (read?.value ?? '').split('/');
  if (read === undefined || more.length > 0 || subtype === undefined || !isToken(type) || !isToken(subtype)) {
    return undefined;
  }
  return { essence: asciiLowerCase(read.value), parameters: read.parameters };
}

/** A token as it is, or a quoted string without its quotes and backslashes; nothing for a value that is neither. */
function unquoted(value: string): string | undefined {
  if (!value.startsWith('"')) {
    return isToken(value) ? value : undefined;
  }
  if (value.length < 2 || !value.endsWith('"')) {
    return undefined;
  }
  let text = '';
  for (let at = 1; at < value.length - 1; at++) {
    at += value[at] === '\\' ? 1 : 0;
    text += value.charAt(at);
  }
  return text;
}

function splitOutsideQuotes(text: string, separator: string): string[] {
  const segments = [''];
  let quoted = false;
  for (let at = 0; at < text.length; at++) {
    const character = text[at];
    if (character === separator && !quoted) {
      segments.push('');
      continue;
    }
    quoted = character === '"' ? !quoted : quoted;
    const escaped = quoted && character === '\\' ? text.charAt(at + 1) : '';
    segments[segments.length - 1] += character + escaped;
    at += escaped.length;
  }
  return segments;
}
