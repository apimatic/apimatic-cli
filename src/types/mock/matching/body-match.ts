import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { Result } from 'neverthrow';
import { JsonValue } from '../json/json-value.js';
import { BodyExpectation, ContentExpectation, NamedRule, PartExpectation } from '../stub-format/body-expectation.js';
import { decodeUtf8 } from '../text/utf8.js';
import { Difference, Where } from './difference.js';
import { compareJson } from './json-diff.js';
import { FormPart, parseMultipartForm } from './multipart-form.js';
import { NamedValues, RequestModel, valuesOf } from './request-model.js';
import { readSentJson } from './sent-json.js';
import { checkValue, describeValues } from './value-check.js';

export function bodyDifferences(expected: BodyExpectation, request: RequestModel): Difference[] {
  switch (expected.kind) {
    case 'any':
      return [];
    case 'none':
      return request.hasBody() ? [new Difference('body', '', 'no body', describeBytes(request.body))] : [];
    case 'form':
      return formDifferences(expected.fields, request.form());
    case 'multipart':
      return multipartDifferences(expected.parts, request);
    default:
      return contentDifferences(expected, request.body, () => request.json(), 'body', '');
  }
}

/**
 * The JSON / text / bytes comparison shared by whole bodies and multipart parts. Empty text and
 * empty bytes are legitimate expectations (an empty form field), so only JSON treats an empty body
 * as "no content". Text is read as UTF-8 whatever charset the request declares; bytes that are not
 * UTF-8 are named as such rather than shown as replacement characters beside text that looks the same.
 */
function contentDifferences(
  expected: ContentExpectation,
  actual: Uint8Array,
  json: () => Result<JsonValue, string>,
  where: Where,
  name: string
): Difference[] {
  switch (expected.kind) {
    case 'json': {
      if (actual.length === 0) {
        return [new Difference(where, name, 'a JSON body', 'no content')];
      }
      return json().match(
        (root) =>
          compareJson(expected.json, root, where).map(
            (found) => new Difference(found.where, placed(name, found.name), found.expected, found.actual)
          ),
        (reason) => [new Difference(where, name, 'JSON', `not JSON: ${reason}`)]
      );
    }
    case 'text': {
      const sent = decodeUtf8(actual);
      if (sent === undefined) {
        return [new Difference(where, name, 'UTF-8 text', 'bytes that are not UTF-8')];
      }
      return sent === expected.text
        ? []
        : [new Difference(where, name, expected.text, sent.length === 0 ? 'no content' : sent)];
    }
    case 'bytes':
      return Buffer.from(actual).equals(expected.bytes)
        ? []
        : [new Difference(where, name, describeBytes(expected.bytes), describeBytes(actual))];
  }
}

/**
 * A whole body's difference is named by its pointer, the root by nothing; a part's by the part and
 * then the pointer, and by the part alone at its root. Joined without the space, part `a/b` could
 * not be told from part `a` with key `b`.
 */
function placed(part: string, pointer: string): string {
  if (part.length === 0) {
    return pointer;
  }
  return pointer.length === 0 ? part : `${part} ${pointer}`;
}

/** Every declared field by its rule, then every field the stub does not name: a form is a closed set, like a query string in closed mode. */
function formDifferences(fields: readonly NamedRule[], actual: readonly NamedValues[]): Difference[] {
  return [
    ...fields.flatMap(({ name, rule }) => checkValue('form', name, rule, valuesOf(actual, name))),
    ...actual
      .filter(({ name }) => !fields.some((field) => field.name === name))
      .map(
        ({ name, values }) => new Difference('form', name, 'absent (not a field of this stub)', describeValues(values))
      )
  ];
}

function multipartDifferences(
  expected: readonly { name: string; parts: readonly PartExpectation[] }[],
  request: RequestModel
): Difference[] {
  const form = parseMultipartForm(request.contentType(), request.body);
  if (form.kind === 'unreadable') {
    return [new Difference('body', '', form.expected, form.actual)];
  }
  const sent = form.byName;
  return [
    ...expected
      .filter(({ name }) => !sent.has(name))
      .map(({ name }) => new Difference('part', name, 'present', 'absent')),
    ...[...sent.keys()]
      .filter((name) => !expected.some((part) => part.name === name))
      .map((name) => new Difference('part', name, 'absent (not a part of this stub)', 'present')),
    ...expected.flatMap(({ name, parts }) => partsDifferences(name, parts, sent.get(name)))
  ];
}

/** The parts under one name pair up in wire order; a different count is the one difference, since pairing the rest would only restate it. */
function partsDifferences(
  name: string,
  expected: readonly PartExpectation[],
  actual: readonly FormPart[] | undefined
): Difference[] {
  if (actual === undefined) {
    return [];
  }
  if (expected.length !== actual.length) {
    return [new Difference('part', name, `${expected.length} part(s)`, `${actual.length} part(s)`)];
  }
  return expected.flatMap((part, index) => {
    // A lone part keeps its name; repeated parts are told apart by position, as the stub's array lists them.
    const label = expected.length === 1 ? name : `${name}[${index}]`;
    const sent = actual[index];
    return [
      ...checkValue('part', `${label} filename`, part.fileName, sent.fileName),
      ...checkValue('part', `${label} Content-Type`, part.contentType, sent.contentType),
      ...contentDifferences(part.content, sent.content, () => readSentJson(sent.content), 'part', label)
    ];
  });
}

function describeBytes(bytes: Uint8Array): string {
  return bytes.length === 0
    ? 'no content'
    : `${bytes.length} bytes, sha256 ${createHash('sha256').update(bytes).digest('base64')}`;
}
