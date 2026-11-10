import { createHash } from 'node:crypto';
import { Difference } from '../matching/difference.js';
import { isAsciiDigit, isAsciiLetter } from '../text/characters.js';
import { Fields } from './fields.js';

const CHALLENGE_LENGTH = 43;
const MIN_VERIFIER_LENGTH = 43;
const MAX_VERIFIER_LENGTH = 128;

const madeOf = (value: string, marks: string): boolean =>
  Array.from(value).every(
    (character) => isAsciiLetter(character) || isAsciiDigit(character) || marks.includes(character)
  );

/** The unpadded base64url of a SHA-256 hash: 43 characters, so a hex or padded challenge is refused where it is sent. */
export function isChallenge(value: string): boolean {
  return value.length === CHALLENGE_LENGTH && madeOf(value, '-_');
}

/** RFC 7636 with the S256 method only, so a public client proves itself without a secret and a plain challenge is never accepted. */
export function challengeOf(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/**
 * The format comes before the hash: a helper that makes a verifier too short (a GUID's 32 hex
 * digits) or in standard base64 hashes it consistently, so only the format refuses it, as strict
 * servers do (RFC 7636 section 4.1).
 */
export function expectVerifier(form: Fields, challenge: string): Difference[] {
  const sent = form.values('code_verifier');
  if (sent.length !== 1) {
    return [form.wrong('code_verifier', 'the PKCE verifier')];
  }
  const [verifier] = sent;
  const wellFormed =
    verifier.length >= MIN_VERIFIER_LENGTH && verifier.length <= MAX_VERIFIER_LENGTH && madeOf(verifier, '-._~');
  if (!wellFormed) {
    return [form.wrong('code_verifier', 'a verifier of 43 to 128 characters of A-Z a-z 0-9 - . _ ~')];
  }
  return challengeOf(verifier) === challenge
    ? []
    : [form.wrong('code_verifier', 'a verifier whose S256 hash is the code_challenge')];
}
