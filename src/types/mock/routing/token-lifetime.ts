/**
 * How long the tokens an OAuth2 server issues live, as `expires_in`: each oauth2 stub's own
 * `expiresIn`, or the seconds `--token-ttl` names, which replace it on every server. Set it low to
 * exercise refresh.
 */
export type TokenLifetime = { readonly kind: 'fromStub' } | { readonly kind: 'seconds'; readonly value: number };

export const LIFETIME_FROM_STUB: TokenLifetime = { kind: 'fromStub' };

/**
 * 1 or more, as a stub's `expiresIn`: a lifetime below 1 would reach the client as `expires_in`,
 * and client libraries disagree on what 0 or a negative one means.
 */
export function lifetimeOfSeconds(value: number): TokenLifetime {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`A token lifetime is a whole number of seconds, 1 or more; ${value} is not.`);
  }
  return { kind: 'seconds', value };
}

export function lifetimeOr(lifetime: TokenLifetime, stubsOwn: number): number {
  return lifetime.kind === 'seconds' ? lifetime.value : stubsOwn;
}
