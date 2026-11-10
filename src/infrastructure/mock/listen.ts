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

/** An IPv6 literal goes in brackets (RFC 3986 section 3.2.2): a harness cannot read the port of http://::1:4010. */
export function originOf(place: FixedPlace): string {
  const host = place.host.includes(':') && !place.host.startsWith('[') ? `[${place.host}]` : place.host;
  return `http://${host}:${place.port}`;
}

/** How a start-up message names the place: the origin when it is fixed, otherwise the fact that any free port would have done. */
export function describeListen(listen: Listen): string {
  return listen.kind === 'fixed' ? originOf(listen) : 'a free port on localhost';
}
