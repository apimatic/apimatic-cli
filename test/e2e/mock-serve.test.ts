import { ChildProcess, spawn } from 'node:child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { occupied, portOf, released, send } from '../helpers/mock-http.js';
import { TestRequest } from '../helpers/mock-requests.js';
import { stubFixtures } from '../helpers/mock-stubs.js';

// Opt-in: it runs the built CLI (`pnpm build` first) as a test harness in any language would.
const enabled = process.env.APIMATIC_E2E === '1';

const MARKER = 'MOCKSERVER_URL=';
const SAMPLE = path.join(stubFixtures, 'sample');

interface Run {
  readonly child: ChildProcess;
  readonly stdout: () => string;
  readonly stderr: () => string;
  readonly exited: Promise<number | null>;
}

(enabled ? describe : describe.skip)('mock serve (end to end)', function () {
  this.timeout(60 * 1000);

  const runs: Run[] = [];
  const roots: string[] = [];

  const run = (...flags: string[]): Run => {
    const child = spawn(process.execPath, [path.join('bin', 'run.js'), 'mock', 'serve', ...flags], {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
    });
    const out: string[] = [];
    const err: string[] = [];
    child.stdout?.on('data', (chunk) => out.push(String(chunk)));
    child.stderr?.on('data', (chunk) => err.push(String(chunk)));
    const exited = new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)));
    const started = { child, stdout: () => out.join(''), stderr: () => err.join(''), exited };
    runs.push(started);
    return started;
  };

  /** The origin after the marker, as a harness reads it: up to the end of its line. */
  const originOf = async (started: Run): Promise<string> => {
    const deadline = Date.now() + 30 * 1000;
    while (
      !started.stdout().includes(MARKER) ||
      !started.stdout().slice(started.stdout().indexOf(MARKER)).includes('\n')
    ) {
      if (Date.now() > deadline || started.child.exitCode !== null) {
        throw new Error(`The mock did not announce its origin:\n${started.stdout()}\n${started.stderr()}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const after = started.stdout().slice(started.stdout().indexOf(MARKER) + MARKER.length);
    return after.slice(0, after.indexOf('\n')).trim();
  };

  const emptyDirectory = (): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apimatic-mock-e2e-'));
    roots.push(root);
    return root;
  };

  afterEach(async () => {
    for (const started of runs.splice(0)) {
      started.child.kill();
      await started.exited;
    }
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it('prints the origin after its marker on stdout and serves the stubs there', async () => {
    const origin = await originOf(run('--stubs', SAMPLE, '--port', '0'));

    const response = await send(origin, TestRequest.get('/v1/nowhere'));

    expect([
      origin.startsWith('http://localhost:'),
      response.status,
      response.header('X-Mock-Mismatch') !== ''
    ]).to.deep.equal([true, 418, true]);
  });

  it('logs each request on stderr when verbose, and never on stdout', async () => {
    const started = run('--stubs', SAMPLE, '--port', '0', '--verbose');
    const origin = await originOf(started);

    await send(origin, TestRequest.get('/v1/nowhere'));

    expect([
      started.stderr().includes('GET /v1/nowhere -> 418'),
      started.stdout().includes('/v1/nowhere')
    ]).to.deep.equal([true, false]);
  });

  it('issues tokens with the lifetime --token-ttl names', async () => {
    const origin = await originOf(run('--stubs', SAMPLE, '--port', '0', '--token-ttl', '5'));
    const request = TestRequest.post('/oauth2/token').form(
      ['grant_type', 'client_credentials'],
      ['client_id', 'test-client-id'],
      ['client_secret', 'test-client-secret']
    );

    const response = await send(origin, request);

    expect(response.expectJson(200).expires_in).to.equal(5);
  });

  it('exits 1 and lists the problems when a stub file is wrong', async () => {
    const stubs = emptyDirectory();
    fs.writeFileSync(path.join(stubs, 'a.json'), 'nope');

    const started = run('--stubs', stubs, '--port', '0');

    expect([
      await started.exited,
      started.stdout().includes('a.json'),
      started.stdout().includes(MARKER)
    ]).to.deep.equal([1, true, false]);
  });

  it('exits 1 naming the origin when the port is busy, and tries no other', async () => {
    const holder = await occupied('127.0.0.1');
    const port = portOf(holder);

    const started = run('--stubs', SAMPLE, '--port', String(port));

    const code = await started.exited.finally(() => released(holder));
    expect([
      code,
      started.stdout().includes(`http://localhost:${port}`),
      started.stdout().includes(MARKER)
    ]).to.deep.equal([1, true, false]);
  });

  for (const [what, flags, named] of [
    ['a flag it does not have', ['--bogus'], '--bogus'],
    ['a port that is no number', ['--port', 'abc'], 'abc'],
    ['an IP address without a port of its own', ['--host', '0.0.0.0', '--port', '0'], '0.0.0.0'],
    ['a host that is a name', ['--host', 'my-machine'], 'my-machine']
  ] as const) {
    it(`exits 2 naming the argument for ${what}`, async () => {
      const started = run(...flags);

      expect([await started.exited, started.stderr().includes(named)]).to.deep.equal([2, true]);
    });
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    it(`stops cleanly and exits 130 on ${signal}`, async function () {
      // Windows cannot deliver a POSIX signal: kill() there ends the process outright.
      if (process.platform === 'win32') {
        this.skip();
      }
      const started = run('--stubs', SAMPLE, '--port', '0');
      await originOf(started);

      started.child.kill(signal);

      expect([await started.exited, started.stdout().includes('Stopping the mock.')]).to.deep.equal([130, true]);
    });
  }
});
