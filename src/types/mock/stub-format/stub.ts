import { BodyExpectation, NamedRule } from './body-expectation.js';
import { OAuth2Settings } from './oauth2-settings.js';
import { PathTemplate } from './path-template.js';
import { StubResponse } from './stub-response.js';
import { ValueRule } from './value-rule.js';

interface Named {
  /** Unique across all files; load problems and mismatch reports name it. */
  readonly name: string;
  /** The file the stub came from, relative to the stubs directory. */
  readonly file: string;
  /** Free text saying why the stub is as it is; the 418 report repeats it for the reader of a miss. */
  readonly description?: string;
}

interface Endpoint extends Named {
  /** The spec's operationId. */
  readonly operation: string;
  /** The spec's example name when the operation has several, selected with `Prefer: example=`. */
  readonly example?: string;
  readonly route: Route;
  readonly response: StubResponse;
}

/** Served when the request matches the route, the query string and the body exactly, and asks for no other status or example. */
export interface SuccessStub extends Endpoint {
  readonly kind: 'success';
  readonly query: QueryExpectation;
  readonly body: BodyExpectation;
}

/**
 * Served when the request matches the route and carries `Prefer: code=<status>`. A declared error
 * looks the same whatever the query string or body says, so an error stub has neither.
 */
export interface ErrorStub extends Endpoint {
  readonly kind: 'error';
}

/** An OAuth2 authorization server: one per token path. */
export interface OAuth2Stub extends Named {
  readonly kind: 'oauth2';
  readonly settings: OAuth2Settings;
}

export type EndpointStub = SuccessStub | ErrorStub;
export type Stub = EndpointStub | OAuth2Stub;

/**
 * What identifies a request as aimed at an operation with valid credentials. Success and error
 * stubs share it; only success stubs go on to fix the query string and the body.
 */
export interface Route {
  readonly method: string;
  readonly path: PathTemplate;
  /** Names are matched in any letter case. */
  readonly headers: readonly NamedRule[];
  /** Names are matched exactly. */
  readonly cookies: readonly NamedRule[];
  readonly auth: AuthExpectation;
}

/** A rule per key; `closed` refuses a key the stub does not name, which catches a renamed or extra parameter. */
export interface QueryExpectation {
  readonly rules: readonly NamedRule[];
  readonly mode: 'closed' | 'open';
}

/**
 * Which credentials a request must carry: any one of the sets satisfies it, and every credential
 * in a set must be present. This is the OR-of-ANDs shape of an OpenAPI security requirement,
 * carried in the stub so nothing reads the spec at run time. No sets means no credentials.
 */
export interface AuthExpectation {
  readonly anyOf: readonly (readonly Credential[])[];
}

export interface Credential {
  /** The security scheme's name in the spec; mismatch reports name it so the reader can look it up. */
  readonly scheme: string;
  readonly in: 'header' | 'query' | 'cookie';
  readonly name: string;
  readonly rule: ValueRule;
}

/** Every stub the loader read, in file order, after it checked that no two share a name and no two oauth2 stubs claim a path. */
export interface StubSet {
  readonly all: readonly Stub[];
  readonly endpoints: readonly EndpointStub[];
  readonly oauth2Servers: readonly OAuth2Stub[];
}

export function stubSetOf(all: readonly Stub[]): StubSet {
  return {
    all,
    endpoints: all.filter((stub): stub is EndpointStub => stub.kind !== 'oauth2'),
    oauth2Servers: all.filter((stub): stub is OAuth2Stub => stub.kind === 'oauth2')
  };
}
