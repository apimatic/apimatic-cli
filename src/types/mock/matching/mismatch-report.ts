import { jsonArray, jsonObject, jsonText, JsonValue, jsonWhole } from '../json/json-value.js';
import { isPrintableAscii } from '../text/characters.js';
import { Difference } from './difference.js';
import { RequestModel } from './request-model.js';
import { Miss } from './verdict.js';

export const MISMATCH_STATUS = 418;
export const MISMATCH_CONTENT_TYPE = 'application/problem+json';
export const MISMATCH_HEADER = 'X-Mock-Mismatch';
/** How long the header form may be; the body carries every difference. */
export const MISMATCH_HEADER_LIMIT = 1000;

const TYPE = 'urn:mock-server:mismatch';
/** What ends a line in text of any origin: the header carries its summary on one. */
const LINE_BREAKS = [[13, 10], [13], [10], [12], [0x85], [0x2028], [0x2029]].map((units) =>
  String.fromCharCode(...units)
);

/**
 * The body of the 418 answer: problem details naming the closest stub and every difference, so a
 * failing test explains itself. Few APIs declare 418, so a miss rarely decodes as a typed error;
 * where an API does declare it, the X-Mock-Mismatch header, which only this report carries, tells
 * the two apart. A refused OAuth2 request gets the same report, never an RFC 6749 error body.
 */
export function mismatchReport(request: RequestModel, miss: Miss): JsonValue {
  switch (miss.kind) {
    case 'mismatch': {
      const { stub, differences } = miss.closest;
      const about: [string, string][] = [
        ['operation', stub.operation],
        ['closest_stub', stub.name],
        ...(stub.description === undefined ? [] : [['description', stub.description] as [string, string]])
      ];
      const detail = `Closest stub '${stub.name}' differs; ${differences.length} difference(s) listed.`;
      return report(request, 'No stub matches this request', detail, differences, about);
    }
    case 'noStubs':
      return report(request, 'No stub matches this request', 'No stubs are loaded.', [], []);
    case 'rejected': {
      const detail = `The ${miss.what} has ${miss.differences.length} problem(s).`;
      return report(request, `${miss.what} rejected`, detail, miss.differences, []);
    }
  }
}

/** The one-line form behind the X-Mock-Mismatch header, before it is made printable and cut. */
export function mismatchSummary(miss: Miss): string {
  switch (miss.kind) {
    case 'mismatch':
      return `closest '${miss.closest.stub.name}': ${miss.closest.differences.join('; ')}`;
    case 'noStubs':
      return 'no stubs loaded';
    case 'rejected':
      return `${miss.what} rejected: ${miss.differences.join('; ')}`;
  }
}

/** The summary as a header can carry it: one line of printable ASCII, bounded. */
export function mismatchHeaderValue(miss: Miss): string {
  const oneLine = LINE_BREAKS.reduce((text, lineBreak) => text.replaceAll(lineBreak, ' '), mismatchSummary(miss));
  const ascii = oneLine
    .split('')
    .map((unit) =>
      isPrintableAscii(unit) ? unit : `\\u${unit.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`
    )
    .join('');
  return ascii.length <= MISMATCH_HEADER_LIMIT ? ascii : `${ascii.slice(0, MISMATCH_HEADER_LIMIT)}...`;
}

function report(
  request: RequestModel,
  title: string,
  detail: string,
  differences: readonly Difference[],
  about: readonly [string, string][]
): JsonValue {
  return jsonObject([
    ['type', jsonText(TYPE)],
    ['status', jsonWhole(MISMATCH_STATUS)],
    ['title', jsonText(title)],
    ['detail', jsonText(detail)],
    ...about.map(([name, value]): [string, JsonValue] => [name, jsonText(value)]),
    ['request', jsonText(request.line())],
    [
      'differences',
      jsonArray(
        differences.map((difference) =>
          jsonObject([
            ['where', jsonText(difference.where)],
            ['name', jsonText(difference.name)],
            ['expected', jsonText(difference.expected)],
            ['actual', jsonText(difference.actual)]
          ])
        )
      )
    ]
  ]);
}
