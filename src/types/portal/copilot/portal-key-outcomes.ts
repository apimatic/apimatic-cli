/** What the Ask AI service answers a registration with: `created` for a key it did not know; `updated` when it already held it for this account. */
export type RegistrationOutcome = 'created' | 'updated';

/** What the Ask AI service answers a revocation with: `unknown` when it holds no such key, which leaves nothing to revoke. */
export type RevocationOutcome = 'revoked' | 'unknown';

/** Whether the Ask AI service holds a key for this account: `unknown` when it holds no such key, or it was revoked. */
export type LookupOutcome = 'registered' | 'unknown' | 'otherAccount';
