import { Buffer } from 'node:buffer';
import { decodeBase64Url, encodeBase64Url } from '../text/base64.js';

const PREFIX = 'ac-code';

/**
 * What an authorization code carries so that the token endpoint needs no session: the challenge as
 * sent, then the granted scope and the redirect URI, both base64url-encoded because they may hold
 * the separator.
 */
export interface IssuedCode {
  readonly challenge: string;
  readonly scope: string;
  readonly redirectUri: string;
}

export function writeIssuedCode(code: IssuedCode): string {
  const encoded = (text: string) => encodeBase64Url(Buffer.from(text, 'utf8'));
  return [PREFIX, code.challenge, encoded(code.scope), encoded(code.redirectUri)].join('.');
}

/** A code this server issued, or nothing for anything else. */
export function readIssuedCode(code: string): IssuedCode | undefined {
  const [prefix, challenge, scope, redirectUri, ...more] = code.split('.');
  const decoded = [scope, redirectUri].map((part) => (part === undefined ? undefined : decodeBase64Url(part)));
  if (prefix !== PREFIX || more.length > 0 || decoded[0] === undefined || decoded[1] === undefined) {
    return undefined;
  }
  return {
    challenge,
    scope: Buffer.from(decoded[0]).toString('utf8'),
    redirectUri: Buffer.from(decoded[1]).toString('utf8')
  };
}
