import net from 'node:net';
import os from 'os';
import { URL } from 'node:url';
import { expect } from 'chai';
import { fixedPlace } from '../../../src/infrastructure/mock/listen.js';
import {
  FREE_PORT_ATTEMPTS,
  MockHost,
  notListeningMessage,
  StartResult
} from '../../../src/infrastructure/mock/mock-host.js';
import { describeProblems } from '../../../src/types/mock/stub-format/stub-problem.js';
import { stubSetOf } from '../../../src/types/mock/stub-format/stub.js';
import {
  hasIpv6Loopback,
  occupied,
  optionsFor,
  portOf,
  released,
  running,
  send,
  sendHead,
  tempMocks,
  TestMock
} from '../../helpers/mock-http.js';
import { TestRequest } from '../../helpers/mock-requests.js';
import { errorStub, stubsOf, successStub } from '../../helpers/mock-stubs.js';

const IPV4 = '127.0.0.1';
const IPV6 = '::1';
const anything = () => TestRequest.get('/v1/anything');
const portIn = (url: string) => Number(new URL(url).port);

/** A local address with no listener refuses at once; the timeout only guards an adapter that drops packets instead. */
function accepts(address: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: address, port });
    const settle = (accepted: boolean) => {
      socket.destroy();
      resolve(accepted);
    };
    socket.setTimeout(2000, () => settle(false));
    socket.once('connect', () => settle(true));
    socket.once('error', () => settle(false));
  });
}

/** This machine's own IPv4 addresses other than the loopback: the ones a bind to every interface would expose. */
const nonLoopbackAddresses = (): string[] =>
  Object.values(os.networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((each) => each.family === 'IPv4' && !each.internal)
    .map((each) => each.address);

describe('MockHost', () => {
  const temp = tempMocks();
  const holders: net.Server[] = [];

  const hold = async (address: string): Promise<number> => {
    const holder = await occupied(address);
    holders.push(holder);
    return portOf(holder);
  };

  /** A port nothing listens on when it is returned; another process can take it before the host binds it, so a refused start is tried again on a fresh one. */
  const startOnFixedPort = async (host: string, attemptsLeft = FREE_PORT_ATTEMPTS): Promise<TestMock> => {
    const holder = await occupied(host);
    const port = portOf(holder);
    await released(holder);
    const result = await temp.tryStart({}, { listen: fixedPlace(host, port) });
    return result.kind === 'notListening' && attemptsLeft > 1
      ? startOnFixedPort(host, attemptsLeft - 1)
      : new TestMock(running(result));
  };

  beforeEach(function () {
    if (this.currentTest?.title.includes('IPv6') && !hasIpv6Loopback()) {
      this.skip();
    }
  });

  afterEach(async () => {
    await Promise.all(holders.splice(0).map(released));
  });

  describe('on a free port', () => {
    it('listens on localhost on a port the system chose', async () => {
      const mock = await temp.start();

      expect([mock.url.startsWith('http://localhost:'), portIn(mock.url) > 0]).to.deep.equal([true, true]);
    });

    for (const [family, address] of [
      ['IPv4', IPV4],
      ['IPv6', `[${IPV6}]`]
    ]) {
      it(`answers on the ${family} loopback`, async () => {
        const mock = await temp.start();

        const response = await send(`http://${address}:${portIn(mock.url)}`, anything());

        expect(response.status).to.equal(418);
      });
    }

    it('listens on the loopback only, not on an address other machines reach', async () => {
      const mock = await temp.start();

      const accepted = await Promise.all(nonLoopbackAddresses().map((address) => accepts(address, portIn(mock.url))));

      expect(accepted).to.not.include(true);
    });

    it('gives two hosts different ports', async () => {
      const first = await temp.start();

      const second = await temp.start();

      expect(second.url).to.not.equal(first.url);
    });

    it('listens on the next pick when the first is taken before the bind', async () => {
      const taken = await hold(IPV4);
      const offered = [taken, 0];
      const picks: number[] = [];
      const pick = () => {
        picks.push(offered[picks.length] ?? 0);
        return picks[picks.length - 1];
      };

      const result = temp.track(await MockHost.serve(stubsOf({}), optionsFor(temp.directory()), pick));

      expect([picks, portIn(running(result).url) === taken]).to.deep.equal([[taken, 0], false]);
    });

    it('refuses after the last attempt when every pick is taken', async () => {
      const taken = await hold(IPV4);
      const picks: number[] = [];
      const pick = () => {
        picks.push(taken);
        return taken;
      };

      const result = await MockHost.serve(stubsOf({}), optionsFor(temp.directory()), pick);

      expect([result.kind === 'notListening' && result.reason, picks.length]).to.deep.equal([
        'the port is already in use',
        FREE_PORT_ATTEMPTS
      ]);
    });
  });

  describe('on a fixed host and port', () => {
    for (const [family, host, origin] of [
      ['IPv4', IPV4, 'http://127.0.0.1:'],
      ['IPv6', IPV6, 'http://[::1]:']
    ]) {
      it(`listens on the ${family} loopback and answers at the origin it names`, async () => {
        const mock = await startOnFixedPort(host);

        const response = await mock.send(anything());

        expect([mock.url.startsWith(origin), response.status]).to.deep.equal([true, 418]);
      });
    }

    it('refuses a busy port, naming the origin, and tries no other', async () => {
      const port = await hold(IPV4);
      const where = fixedPlace('localhost', port);

      const result = await temp.tryStart({}, { listen: where });

      expect(result).to.deep.equal({
        kind: 'notListening',
        where,
        reason: `the port is already in use (something answers at 127.0.0.1:${port})`
      });
    });

    it('refuses localhost when the port is busy on the IPv6 loopback alone', async () => {
      const port = await hold(IPV6);

      const result = await temp.tryStart({}, { listen: fixedPlace('localhost', port) });

      expect(result.kind === 'notListening' && result.reason).to.equal(
        `the port is already in use (something answers at [::1]:${port})`
      );
    });

    it('binds 127.0.0.1 alone, so a port busy on the IPv6 loopback does not stop it', async () => {
      const port = await hold(IPV6);
      const mock = new TestMock(running(await temp.tryStart({}, { listen: fixedPlace(IPV4, port) })));

      const response = await mock.send(anything());

      expect(response.status).to.equal(418);
    });

    it('binds ::1 alone, so a port busy on the IPv4 loopback does not stop the IPv6 one', async () => {
      const port = await hold(IPV4);
      const mock = new TestMock(running(await temp.tryStart({}, { listen: fixedPlace(IPV6, port) })));

      const response = await mock.send(anything());

      expect(response.status).to.equal(418);
    });

    it('says what stopped it in one sentence that names the place', () => {
      const message = notListeningMessage(fixedPlace('localhost', 4010), 'the port is already in use');

      expect(message).to.equal('The mock could not start on http://localhost:4010: the port is already in use');
    });
  });

  describe('the stubs', () => {
    it('loads the stubs of its directory', async () => {
      const mock = await temp.start({
        'x.json': successStub({ name: 'one' }),
        'y.json': errorStub({ name: 'two' })
      });

      const names = mock.host.stubs.endpoints.map((stub) => stub.name);

      expect(names).to.deep.equal(['one', 'two']);
    });

    it('answers 418 saying so when no stubs are loaded', async () => {
      const mock = await temp.start();

      const response = await mock.send(anything());

      expect([response.status, response.json().detail]).to.deep.equal([418, 'No stubs are loaded.']);
    });

    it('lists every problem of broken stubs and starts nothing', async () => {
      const result: StartResult = await temp.tryStart({
        'a.json': 'nope',
        'b.json': errorStub({ status: 200 })
      });

      const problems = result.kind === 'stubProblems' ? result.problems : [];

      expect([
        problems.map((problem) => problem.file),
        describeProblems(problems).startsWith('2 problem(s) in the stubs:')
      ]).to.deep.equal([['a.json', 'b.json'], true]);
    });
  });

  describe('stop', () => {
    it('refuses connections once it has stopped', async () => {
      const mock = await temp.start();
      const port = portIn(mock.url);

      await mock.host.stop();

      expect(await accepts(IPV4, port)).to.equal(false);
    });

    it('does not wait for a connection a client keeps open', async () => {
      const mock = await temp.start();
      const kept = net.connect({ host: IPV4, port: portIn(mock.url) });
      const answered = new Promise((resolve) => kept.once('data', resolve));
      kept.write('GET /v1/anything HTTP/1.1\r\nHost: localhost\r\n\r\n');
      await answered;
      const started = Date.now();

      await mock.host.stop();

      expect(Date.now() - started).to.be.lessThan(2000);
      kept.destroy();
    });

    it('can be stopped twice', async () => {
      const mock = await temp.start();
      await mock.host.stop();

      const second = await mock.host.stop();

      expect(second).to.equal(undefined);
    });
  });

  describe('a request the HTTP parser rejects', () => {
    it('answers 400 with the reason to a method in lower case, which never reaches the stubs', async () => {
      const mock = await temp.start({ 'a.json': successStub() });

      const answer = await mock.sendRaw('get', '/v1/x');

      expect([answer.startsWith('HTTP/1.1 400 Bad Request\r\n'), answer.split('\r\n\r\n')[1]]).to.deep.equal([
        true,
        'The mock could not read this request as HTTP: Parse Error: Invalid method encountered'
      ]);
    });

    it('answers 431 to headers past the limit', async () => {
      const mock = await temp.start();

      const answer = await mock.sendRaw('GET', '/v1/x', `X-Long: ${'x'.repeat(20_000)}`);

      expect(answer.startsWith('HTTP/1.1 431 Request Header Fields Too Large\r\n')).to.equal(true);
    });
  });

  describe('a failure of its own', () => {
    it('answers 500 saying why when it cannot write what a stub states', async () => {
      const [stub] = stubsOf({ 'a.json': successStub() }).endpoints;
      const unwritable = {
        ...stub.response,
        headers: [{ name: 'X-Broken', value: 'a' + String.fromCharCode(10) + 'b' }]
      };
      const stubs = stubSetOf([{ ...stub, response: unwritable }]);
      const mock = new TestMock(running(temp.track(await MockHost.serve(stubs, optionsFor(temp.directory())))));

      const response = await mock.send(TestRequest.get('/v1/x'));

      expect([response.status, response.text().startsWith('The mock failed to answer: ')]).to.deep.equal([500, true]);
    });
  });

  describe('a Host the mock cannot read a URL from', () => {
    const heads: [string, string, string[]][] = [
      ['an HTTP/1.0 request without one', '', ['GET /v1/x HTTP/1.0']],
      ['an HTTP/1.1 request without one', '', ['GET /v1/x HTTP/1.1', 'Connection: close']],
      ['an empty one', '', ['GET /v1/x HTTP/1.1', 'Host:', 'Connection: close']],
      ['a port above 65535', 'localhost:99999', ['GET /v1/x HTTP/1.1', 'Host: localhost:99999', 'Connection: close']],
      ['two of them', 'a, b', ['GET /v1/x HTTP/1.1', 'Host: a', 'Host: b', 'Connection: close']]
    ];

    for (const [what, host, head] of heads) {
      it(`answers 400 naming it to ${what}`, async () => {
        const mock = await temp.start({ 'a.json': successStub() });

        const answer = await sendHead(mock.url, head);

        expect([answer.startsWith('HTTP/1.1 400 Bad Request\r\n'), answer.split('\r\n\r\n')[1]]).to.deep.equal([
          true,
          `The request's Host header ('${host}') names no host and port the mock can read its URL from.`
        ]);
      });
    }
  });
});
