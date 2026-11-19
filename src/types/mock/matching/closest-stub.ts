import { EndpointStub } from '../stub-format/stub.js';
import { levenshtein } from '../text/text-distance.js';
import { Difference } from './difference.js';
import { parsePreference } from './preference.js';
import { RequestModel } from './request-model.js';
import { differencesFrom } from './stub-matcher.js';

/** A stub, every way the request differs from it, and the weighted distance those differences add up to. */
export interface Candidate {
  readonly stub: EndpointStub;
  readonly differences: readonly Difference[];
  readonly distance: number;
}

/**
 * Another path is most likely another operation, so it weighs more than any one other difference;
 * the edit distance then picks the nearest spelling. The weights add up, so more than a hundred
 * small differences against the right path still outweigh it.
 */
const WRONG_PATH = 100;
/** Another method on the same path is still the wrong operation, but a close one. */
const WRONG_METHOD = 50;
/** An error stub the request did not ask for. */
const UNREQUESTED_ERROR = 10;
/** A stub of another named example; sinks it below the one the request asked for, whatever else differs there. */
const OTHER_EXAMPLE = 10;
/** The "none of the alternatives" summary line, which the alternatives it precedes already count. */
const AUTH_SUMMARY = 0;
/**
 * A query key the stub does not take. The request was more likely meant for a stub that takes the
 * key with another value, so that stub is reported: "expected 1, got 2" rather than "not a
 * parameter of this stub".
 */
const UNWANTED_QUERY_KEY = 2;
const ANY_OTHER = 1;

/**
 * Ranks stubs by how far a request is from each, closest first, so a mismatch report explains the
 * stub the author most likely meant. Of stubs that weigh the same, the one with fewer differences
 * comes first, since a report of one difference is easier to act on than one of several; then a
 * success stub before an error stub; then file order.
 */
export function rankStubs(stubs: readonly EndpointStub[], request: RequestModel): Candidate[] {
  const ranked = stubs
    .map((stub) => candidateOf(stub, request))
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (first, second) =>
        first.candidate.distance - second.candidate.distance ||
        first.candidate.differences.length - second.candidate.differences.length ||
        Number(first.candidate.stub.kind === 'error') - Number(second.candidate.stub.kind === 'error') ||
        first.index - second.index
    )
    .map(({ candidate }) => candidate);
  return successFirst(ranked, request);
}

/**
 * An error stub's template fits any identifier, and also a literal sibling such as `/search` beside
 * `/{id}`, so an error stub can come first for a request that asks for no error (no `code=`, or one
 * below the 400 every error stub has). A success stub of its operation, or one whose method and
 * path the request has, then goes ahead of it, and the report names what really differs rather than
 * a missing `Prefer`. A request that asks for an error keeps the ranking.
 */
function successFirst(ranked: Candidate[], request: RequestModel): Candidate[] {
  const [top] = ranked;
  const asked = parsePreference(request.header('Prefer')).code;
  if (top?.stub.kind !== 'error' || (asked !== undefined && asked >= 400)) {
    return ranked;
  }
  const explains = ({ stub, differences }: Candidate) =>
    stub.kind === 'success' &&
    (stub.operation === top.stub.operation || differences.every(({ where }) => where !== 'path' && where !== 'method'));
  return [...ranked.filter(explains), ...ranked.filter((candidate) => !explains(candidate))];
}

function candidateOf(stub: EndpointStub, request: RequestModel): Candidate {
  const differences = differencesFrom(stub, request);
  const distance = differences.reduce((sum, difference) => sum + weight(difference, stub, request), 0);
  return { stub, differences, distance };
}

/**
 * What a difference weighs depends on the stub it is against: a missing `Prefer` is an unrequested
 * error only against an error stub, and a query key is unwanted only by a stub that does not take it.
 */
function weight(difference: Difference, stub: EndpointStub, request: RequestModel): number {
  const { where, name, actual } = difference;
  if (where === 'path') {
    return WRONG_PATH + levenshtein(stub.route.path.toString(), request.path);
  }
  if (where === 'method') {
    return WRONG_METHOD;
  }
  if (where === 'header' && name === 'Prefer' && actual === 'absent' && stub.kind === 'error') {
    return UNREQUESTED_ERROR;
  }
  if (where === 'header' && name === 'Prefer' && actual.startsWith('example=')) {
    return OTHER_EXAMPLE;
  }
  if (where === 'auth' && name === '') {
    return AUTH_SUMMARY;
  }
  // A stub takes a key it has a value for; one it leaves out of its set, or declares absent, it does not take.
  const takes =
    stub.kind === 'success' && stub.query.rules.some((rule) => rule.name === name && rule.rule.kind !== 'absent');
  return where === 'query' && stub.kind === 'success' && !takes ? UNWANTED_QUERY_KEY : ANY_OTHER;
}
