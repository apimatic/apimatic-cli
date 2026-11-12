import { err, Result } from 'neverthrow';
import { readJson } from '../json/json-reader.js';
import { JsonValue } from '../json/json-value.js';
import { decodeUtf8 } from '../text/utf8.js';

/** A request body or part read as JSON, strictly: the document, or why it is none, in the words of a report's actual side. */
export function readSentJson(bytes: Uint8Array): Result<JsonValue, string> {
  const text = decodeUtf8(bytes);
  return text === undefined ? err('bytes that are not UTF-8') : readJson(text);
}
