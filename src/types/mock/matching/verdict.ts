import { EndpointStub } from '../stub-format/stub.js';
import { StubResponse, withOrigin } from '../stub-format/stub-response.js';
import { Candidate, rankStubs } from './closest-stub.js';
import { Difference } from './difference.js';
import { RequestModel } from './request-model.js';
import { answers } from './stub-matcher.js';

/** A response to send: the stub that matched, or what the OAuth2 server composed (a token, or the consent redirect). */
export type Answer =
  | { readonly kind: 'matched'; readonly stub: EndpointStub }
  | { readonly kind: 'served'; readonly response: StubResponse };

/** Nothing to send but the 418 report: the closest stub, no stubs at all, or why the OAuth2 server refused. */
export type Miss =
  | { readonly kind: 'mismatch'; readonly closest: Candidate }
  | { readonly kind: 'noStubs' }
  | {
      readonly kind: 'rejected';
      /** The request in the report's words, for example "OAuth2 token request". */
      readonly what: string;
      readonly differences: readonly Difference[];
    };

/** What the mock does with a request. The report takes a `Miss`, so it never has to reject an answer. */
export type Verdict = Answer | Miss;

/**
 * The first matching stub in file order wins, and no stub after it is examined. Only a miss diffs
 * every stub in full, to rank them and explain the closest one.
 */
export function verdictOf(stubs: readonly EndpointStub[], request: RequestModel): Verdict {
  const match = stubs.find((stub) => answers(stub, request));
  if (match !== undefined) {
    return { kind: 'matched', stub: match };
  }
  const [closest] = rankStubs(stubs, request);
  return closest === undefined ? { kind: 'noStubs' } : { kind: 'mismatch', closest };
}

export function isAnswer(verdict: Verdict): verdict is Answer {
  return verdict.kind === 'matched' || verdict.kind === 'served';
}

/**
 * The response as sent to a request that arrived on this origin. Only a stub's answer resolves
 * {{origin}}: what the OAuth2 server composed echoes the client's own values, so a redirect_uri
 * holding the placeholder goes back in Location as sent.
 */
export function responseOn(answer: Answer, origin: string): StubResponse {
  return answer.kind === 'matched' ? withOrigin(answer.stub.response, origin) : answer.response;
}
