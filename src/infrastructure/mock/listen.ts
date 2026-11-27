import { isIP } from 'node:net';
import { URL } from 'node:url';
import { err, ok, Result } from 'neverthrow';

export const LOCALHOST = 'localhost';

const MAX_PORT = 65_535;

/** A host and port to bind as given. */
export interface FixedPlace {
  readonly kind: 'fixed';
  readonly host: string;
  readonly port: number;
}

/**
 * Where the mock listens: a free port on localhost, which is what tests want so parallel runs
 * never collide, or a fixed host and port for a container or a harness that wants a stable origin.
 * Free ports are found on localhost only, so "another host on a free port" is not a value of this
 * type and nothing has to check for it.
 */
export type Listen = { readonly kind: 'freePort' } | FixedPlace;

export const FREE_PORT: Listen = { kind: 'freePort' };

/** Port 0 would let the system choose, which on a host other than localhost is no place a caller named; a free port is `FREE_PORT`. */
export function fixedPlace(host: string, port: number): FixedPlace {
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new RangeError(`A fixed port is 1 to ${MAX_PORT}; ${port} is not. Use FREE_PORT for a free one.`);
  }
  return { kind: 'fixed', host, port };
}

/**
 * The place a host and a port name together, as the command's flags give them. A host is localhost
 * in any letter case or an IP address, which is kept in its canonical spelling: any other name
 * would be bound wherever it happens to resolve. Port 0 asks for a free port, which exists on
 * localhost alone.
 */
export function listenAt(host: string, port: number): Result<Listen, string> {
  if (host.toLowerCase() === LOCALHOST) {
    return ok(port === 0 ? FREE_PORT : fixedPlace(LOCALHOST, port));
  }
  const address = canonicalAddress(host);
  if (address === undefined) {
    return err(`'${host}' is neither localhost nor an IP address.`);
  }
  return port === 0
    ? err(`The host ${address} needs a port other than 0: a free port is found on localhost alone.`)
    : ok(fixedPlace(address, port));
}

/** A bracketed IPv6 literal must end at its bracket: `[::1]:80` would otherwise lose its port without a word. */
function canonicalAddress(host: string): string | undefined {
  const address = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  switch (isIP(address)) {
    case 4:
      return new URL(`http://${address}`).hostname;
    case 6:
      return new URL(`http://[${address}]`).hostname.slice(1, -1);
    default:
      return undefined;
  }
}

/** An IPv6 literal goes in brackets (RFC 3986 section 3.2.2): a harness cannot read the port of http://::1:4010. */
export function originOf(place: FixedPlace): string {
  const host = place.host.includes(':') && !place.host.startsWith('[') ? `[${place.host}]` : place.host;
  return `http://${host}:${place.port}`;
}

/** How a start-up message names the place: the origin when it is fixed, otherwise the fact that any free port would have done. */
export function describeListen(listen: Listen): string {
  return listen.kind === 'fixed' ? originOf(listen) : 'a free port on localhost';
}
