import { OAuth2Server } from '../auth/oauth2-server.js';
import { RequestModel } from '../matching/request-model.js';
import { Verdict, verdictOf } from '../matching/verdict.js';
import { EndpointStub, StubSet } from '../stub-format/stub.js';
import { LIFETIME_FROM_STUB, lifetimeOr, TokenLifetime } from './token-lifetime.js';

/**
 * Decides every request: the host routes nothing itself, so what the HTTP server does is what the
 * tests of the matcher and of the OAuth2 server verify.
 */
export class StubRouter {
  private readonly endpoints: readonly EndpointStub[];
  /** In file order; the loader guarantees that no two claim a path, so the first to answer is the only one that would. */
  private readonly servers: readonly OAuth2Server[];

  public constructor(stubs: StubSet, lifetime: TokenLifetime = LIFETIME_FROM_STUB) {
    this.endpoints = stubs.endpoints;
    this.servers = stubs.oauth2Servers.map(
      ({ settings }) => new OAuth2Server({ ...settings, expiresIn: lifetimeOr(lifetime, settings.expiresIn) })
    );
  }

  /** The OAuth2 servers speak first for their own paths, whatever the method or the file order; every other request is matched against the stubs. */
  public decide(request: RequestModel): Verdict {
    for (const server of this.servers) {
      const verdict = server.answer(request);
      if (verdict !== undefined) {
        return verdict;
      }
    }
    return verdictOf(this.endpoints, request);
  }
}
