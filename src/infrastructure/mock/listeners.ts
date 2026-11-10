import { Server } from 'node:http';
import { AddressInfo, connect, isIP } from 'node:net';
import { err, ok, Result } from 'neverthrow';
import { LOCALHOST } from './listen.js';

const IPV4_LOOPBACK = '127.0.0.1';
const IPV6_LOOPBACK = '::1';
const PROBE_PATIENCE_MS = 500;

/** An address to bind; one a machine may lack (the IPv6 loopback in a container) is skipped rather than refused. */
interface BindAddress {
  readonly address: string;
  readonly required: boolean;
}

export interface Listening {
  readonly servers: readonly Server[];
  readonly port: number;
}

/**
 * `localhost` is both loopbacks on one port, since a client may resolve the name to either. Any
 * other host is bound as written: an IP literal as that address alone, a name as it resolves.
 */
export function addressesOf(host: string): BindAddress[] {
  if (host === LOCALHOST) {
    return [
      { address: IPV4_LOOPBACK, required: true },
      { address: IPV6_LOOPBACK, required: false }
    ];
  }
  const unbracketed = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  return [{ address: unbracketed, required: true }];
}

/**
 * Every address on one port, or none: the first bind settles the port (the system's choice when
 * `port` is 0) and the rest take the same one. A refusal closes what was opened and says why.
 */
export async function listenOnAll(
  create: () => Server,
  addresses: readonly BindAddress[],
  port: number
): Promise<Result<Listening, string>> {
  const servers: Server[] = [];
  let bound = port;
  for (const { address, required } of addresses) {
    const server = create();
    const listening = await listenOn(server, address, bound);
    if (listening.isOk()) {
      servers.push(server);
      bound = listening.value;
    } else if (required || !isMissingAddress(listening.error)) {
      await Promise.all(servers.map(closed));
      return err(reasonOf(listening.error, address));
    }
  }
  return ok({ servers, port: bound });
}

/**
 * Whether something already answers on the port. Windows and macOS let a process bind
 * 127.0.0.1:P while another holds 0.0.0.0:P, and the new socket then takes the loopback traffic
 * meant for the first: the other server's clients would get this mock's 418s. Node has no table of
 * listeners to read, and binding every interface to find out would raise a firewall prompt, so the
 * port is asked instead.
 */
export async function busyReason(addresses: readonly BindAddress[], port: number): Promise<string | undefined> {
  for (const { address } of addresses.filter((each) => isIP(each.address) !== 0)) {
    const probed = probeAddressOf(address);
    if (await answersAt(probed, port)) {
      return `the port is already in use (something answers at ${isIP(probed) === 6 ? `[${probed}]` : probed}:${port})`;
    }
  }
  return undefined;
}

export function closed(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function listenOn(server: Server, address: string, port: number): Promise<Result<number, NodeJS.ErrnoException>> {
  return new Promise((resolve) => {
    const refused = (error: NodeJS.ErrnoException) => resolve(err(error));
    server.once('error', refused);
    server.listen({ host: address, port, exclusive: true }, () => {
      server.off('error', refused);
      resolve(ok((server.address() as AddressInfo).port));
    });
  });
}

function answersAt(address: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: address, port });
    const settle = (answered: boolean) => {
      socket.destroy();
      resolve(answered);
    };
    socket.setTimeout(PROBE_PATIENCE_MS, () => settle(false));
    socket.once('connect', () => settle(true));
    socket.once('error', () => settle(false));
  });
}

/** A listener on every interface is reached through the loopback of its family. */
function probeAddressOf(address: string): string {
  if (address === '0.0.0.0') {
    return IPV4_LOOPBACK;
  }
  return address === '::' ? IPV6_LOOPBACK : address;
}

function isMissingAddress(error: NodeJS.ErrnoException): boolean {
  return error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT';
}

function reasonOf(error: NodeJS.ErrnoException, address: string): string {
  switch (error.code) {
    case 'EADDRINUSE':
      return 'the port is already in use';
    case 'EACCES':
      return 'this process is not allowed to listen on the port';
    case 'EADDRNOTAVAIL':
      return `this machine has no address ${address}`;
    case 'ENOTFOUND':
      return `the host ${address} is not known`;
    default:
      return error.message;
  }
}
